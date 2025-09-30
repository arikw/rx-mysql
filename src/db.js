/* eslint-disable key-spacing */
const
  mysql = require('mysql2/promise'),
  { createTunnel } = require('tunnel-ssh'),
  { readFile } = require('fs/promises'),
  { queryFormat, convertColumnNameCasing } = require('./helpers.js');

const poolConfigDefaults = {
  host:               process.env.MYSQL_HOST,
  database:           process.env.MYSQL_DATABASE,
  port:               process.env.MYSQL_PORT ?? 3306,
  user:               process.env.MYSQL_USER,
  password:           process.env.MYSQL_PASSWORD,
  multipleStatements: process.env.MYSQL_MULTIPLE_STATEMENTS ?? true,
  connectionLimit:    process.env.MYSQL_POOL_SIZE || 15,
  timezone:           '+00:00', // UTC
  queryFormat // see https://www.npmjs.com/package/mysql#custom-format
};

async function init(config = {}) {

  let
    connectionPromise,
    tunnelServer,
    pool;

  // for test mode
  let
    lastQuery,
    lastTransaction,
    transationStarted = false,
    resultsByMatch;

  const poolConfig = Object.assign({
    host:               config.host               ?? poolConfigDefaults.host,
    database:           config.database           ?? poolConfigDefaults.database,
    port:               config.port               ?? poolConfigDefaults.port,
    user:               config.user               ?? poolConfigDefaults.user,
    password:           config.password           ?? poolConfigDefaults.password,
    multipleStatements: config.multipleStatements ?? poolConfigDefaults.multipleStatements,
    connectionLimit:    config.connectionLimit    ?? poolConfigDefaults.connectionLimit,
    timezone:           config.timezone           ?? poolConfigDefaults.timezone,
    queryFormat:        config.queryFormat        ?? poolConfigDefaults.queryFormat
  }, config.mysql2);

  const connectionConfig = {
    maxExecutionTime:   config.maxExecutionTime   ?? process.env.MYSQL_MAX_EXECUTION_TIME ?? 30000, // in milliseconds
    lazyConnect:        config.lazyConnect        ?? ((process.env.MYSQL_LAZY_CONNECT ?? 'true') === 'true')
  };

  const generalConfig = {
    logLevel:           config.logLevel           ?? (process.env.MYSQL_LOG_LEVEL ?? (process.env.NODE_ENV === 'development' ? 'debug' : 'error')),
    testMode:           config.testMode           ?? ((process.env.MYSQL_TEST_MODE === 'true') === true)
  };

  const sshTunnelConfig = {

    privateKeyFile:   process.env.DB_SSH_TUNNEL_PRIVATE_KEY_FILE ?? config.sshTunnel?.privateKeyFile,

    sshOptions: Object.assign({
      host:           process.env.DB_SSH_TUNNEL_HOST,
      port:           process.env.DB_SSH_TUNNEL_PORT,
      username:       process.env.DB_SSH_TUNNEL_USERNAME,
      privateKey:     process.env.DB_SSH_TUNNEL_PRIVATE_KEY
    }, config.sshTunnel?.sshOptions),

    serverOptions: Object.assign({
      host:  '127.0.0.1',
      path: 'whatever', // temp fix for https://github.com/agebrock/tunnel-ssh/issues/123
      port: 0 // will open a free port and save it to `tunnelPort` variable
    }, config.sshTunnel?.serverOptions),

    forwardOptions: Object.assign({
      dstAddr:       process.env.DB_SSH_TUNNEL_DST_ADDR ?? '127.0.0.1',
      dstPort:       process.env.DB_SSH_TUNNEL_DST_PORT ?? 3306
    }, config.sshTunnel?.forwardOptions),

    tunnelOptions:   Object.assign({
      autoClose: false
    }, config.sshTunnel?.tunnelOptions)
  };

  function connect() {

    if (generalConfig.testMode === true) {
      log('TEST MODE - simulating db connection');
      return Promise.resolve({ pool: null });
    }

    if (connectionPromise) {
      return connectionPromise;
    }

    connectionPromise = new Promise((resolve, reject) => {
      (async () => {
        try {

          if (sshTunnelConfig.sshOptions?.host) {
            const { server } = await establishTunnel();
            poolConfig.host = server.address().address;
            poolConfig.port = server.address().port;
            tunnelServer = server;
          }

          const corePool = mysql.createPool(poolConfig);
          pool = poolWrapper(corePool);
          pool.on('connection', (conn) => {
            // https://medium.com/@magnusjt/gotcha-timezones-in-nodejs-and-mysql-b39e418c9d3
            conn.query(/*sql*/ `
              SET
                time_zone='${poolConfig.timezone}',
                group_concat_max_len = 16384;
            `, (error) => {
              if (error) {
                throw error;
              }
            });
            if (connectionConfig.maxExecutionTime) {
              conn.query(/*sql*/ `
                SET
                  SESSION max_execution_time = ${connectionConfig.maxExecutionTime}
              `, (error) => ({ error }));
            }
          });

          // make sure we're connected
          const result = await corePool.query('SELECT 1;').catch(error => ({ error }));
          if (result.error) {

            log('error connecting to the db');

            throw (result.error);
          }

          log(`connected to db "${poolConfig.database}" on ${poolConfig.host}:${poolConfig.port}`);

          resolve({ pool });
        } catch (error) {
          reject(error);
        }
      })();
    });

    return connectionPromise;
  }

  async function disconnect() {
    if (pool) {
      try {
        await pool.end();
        log('db pool disconnected');
      } catch (error) {
        // do nothing
      }
      pool = null;
      connectionPromise = null;
    }

    if (tunnelServer) {
      tunnelServer.close();
      tunnelServer = null;
    }
  }

  async function establishTunnel() {

    const privateKeyFile = sshTunnelConfig.privateKeyFile;
    const privateKey = sshTunnelConfig.sshOptions.privateKey;
    if (!privateKey && privateKeyFile) {
      log('reading private key file for ssh tunnel...');
      sshTunnelConfig.sshOptions.privateKey = await readFile(privateKeyFile, 'utf8');
      log('private key file read', sshTunnelConfig.sshOptions.privateKey.length, 'bytes');
    }
    const [server, sshConnection] = await createTunnel(sshTunnelConfig.tunnelOptions, sshTunnelConfig.serverOptions, sshTunnelConfig.sshOptions, sshTunnelConfig.forwardOptions);

    // Use a listener to handle errors outside the callback
    server.on('error', error => {
      log('error in ssh tunnel');
    });

    sshConnection.on('error', function () {
      log('error in ssh connection', ...arguments);
    });

    log(`SSH tunnel established on ${server.address().address}:${server.address().port}`);

    return ({ server, sshConnection });
  }

  function log(...args) {
    if (generalConfig.logLevel === 'debug') {
      console.info('[mysql]', ...args);
    }
  }

  async function executeQuery(queryConfig, ...args) {

    await connect();

    const queryProvider = this; // pool or connection

    const mergedQueryConfig = {
      ...queryProvider.queryConfig,
      ...queryConfig
    };

    const [results, results_meta] =
      // pool.query is a shortcut for the pool.getConnection() -> connection.query() -> connection.release()
      await queryProvider.query.apply(queryProvider, args)
        .catch(error => ([{ error }]));

    if (results.error) {
      const error = results.error;
      await queryProvider.query('ROLLBACK;'); //TODO: rollback only state mutating querys and\or transactions

      if (process.env.NODE_ENV === 'production') {
        error.rawMessage = error.message;
        error.message = 'SQL error'; // obfuscate error message
      }

      throw error;
    }

    if (mergedQueryConfig.nativeQuery === true) {
      return [results, results_meta];
    }

    if (mergedQueryConfig.keepOriginalCasing !== true) {
      convertColumnNameCasing(results);
    }

    return results;
  }

  // It is important to understand that many commands in MySQL can cause an implicit commit,
  async function beginTransaction(queryConfig) {
    const connection = await pool.getConnection(queryConfig);
    await connection.beginTransaction();

    return connection;
  }

  function connectionWrapper(connection, queryConfig) {
    // Proxy the release method to return the connection to the pool
    const wrapped = new Proxy(connection, {
      get(target, prop, receiver) {
        if (prop === 'query') {
          return (sql, values, options, ...restArgs) => executeQuery.call(target, options, sql, values, ...restArgs);
        }
        return Reflect.get(target, prop, receiver);
      }
    });

    wrapped.queryConfig = queryConfig;
    return wrapped;
  }

  function poolWrapper(pool) {
    // Proxy the getConnection method to return a wrapped connection
    return new Proxy(pool, {
      get(target, prop, receiver) {
        if (prop === 'getConnection') {
          return async function (queryConfig) {
            return connectionWrapper(await target.getConnection(), queryConfig);
          };
        } else if (prop === 'query') {
          return (sql, values, options, ...restArgs) => executeQuery.call(target, options, sql, values, ...restArgs);
        } else if (prop === 'beginTransaction') {
          return (queryConfig) => beginTransaction.call(target, queryConfig);
        }
        return Reflect.get(target, prop, receiver);
      }
    });
  }

  function createLazyPoolProxy() {
    let realPool = null;

    return new Proxy({}, {
      get(target, prop, receiver) {
        if (!realPool) {
          if (['query', 'getConnection', 'beginTransaction'].includes(prop)) {
            return async (...args) => {
              const { pool: connectedPool } = await connect();
              realPool = connectedPool;
              return realPool[prop](...args);
            };
          } else if (['escape', 'escapeId', 'format'].includes(prop)) {
            if (!pool) {
              return mysql[prop];
            }
          } else if (prop === 'then') {
            // Allow await on the lazy pool itself
            return undefined;
          }
        }

        return Reflect.get(realPool, prop, receiver);
      }
    });
  }

  function createTestPoolProxy() {
    const testPool = new Proxy({}, {
      get(target, prop, receiver) {
        if (['escape', 'escapeId', 'format'].includes(prop)) {
          if (!pool) {
            return mysql[prop];
          }
        } else if (['query'].includes(prop)) {
          return async (sql, values, options) => {
            lastQuery = queryFormat.call(mysql, sql, values);
            if (transationStarted) {
              lastTransaction += `\n${lastQuery};`;
            }
            log('TEST MODE - simulating db query');
            if (resultsByMatch) {
              const matched = resultsByMatch.find(({ regex }) => regex.test(lastQuery));
              if (matched) {
                return matched.result;
              }
            }
            return [];
          };
        } else if (prop === 'getConnection') {
          return () => {
            return testPool;
          };
        } else if (prop === 'beginTransaction') {
          return () => {
            transationStarted = true;
            lastTransaction = 'START TRANSACTION;';
            return testPool;
          };
        } else if (prop === 'commit') {
          return () => { transationStarted = false; lastTransaction += '\nCOMMIT;'; };
        } else if (prop === 'rollback') {
          return () => { transationStarted = false; lastTransaction += '\nROLLBACK;'; };
        } else if (prop === 'then') {
          // Allow await on the lazy pool itself
          return undefined;
        } else if (prop === 'lastQuery') {
          return lastQuery;
        } else if (prop === 'release') {
          return () => {
            // do nothing
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    return testPool;
  }

  let resultedPool;
  if (generalConfig.testMode === true) {
    resultedPool = createTestPoolProxy();
  } else if (connectionConfig.lazyConnect === true) {
    resultedPool = createLazyPoolProxy();
  } else {
    resultedPool = (await connect()).pool;
  }

  return {
    pool: resultedPool,
    connect,
    disconnect,
    query: (...args) => resultedPool.query(...args),
    beginTransaction: (...args) => resultedPool.beginTransaction(...args),
    escape: (...args) => resultedPool.escape(...args),
    escapeId: (...args) => resultedPool.escapeId(...args),
    format: (...args) => resultedPool.format(...args),
    getConnection: (...args) => resultedPool.getConnection(...args),
    ...(generalConfig.testMode === true) ? {
      getLastQuery: () => lastQuery,
      setResultsByMatch: (newResultsByMatch) => { resultsByMatch = newResultsByMatch; },
      getLastTransaction: () => lastTransaction,
      clearLastQuery: () => { lastQuery = null; },
      clearResultsByMatch: () => { resultsByMatch = null; },
      clearLastTransaction: () => { lastTransaction = null; transationStarted = false; },
      clearAll: () => { lastQuery = null; resultsByMatch = null; lastTransaction = null; transationStarted = false; }
    } : {}
  };
}

module.exports = init;
