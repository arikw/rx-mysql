const
  mysql = require('mysql2/promise'),
  { createTunnel } = require('tunnel-ssh'),
  { readFile } = require('fs/promises'),
  { queryFormat, convertColumnNameCasing } = require('./helpers.js');

function init(config = {}) {
  const poolConfig = {
    host: config.host ?? process.env.MYSQL_HOST,
    database: config.database ?? process.env.MYSQL_DATABASE,
    port: config.port ?? process.env.MYSQL_PORT ?? 3306,
    user: config.user ?? process.env.MYSQL_USER,
    password: config.password ?? process.env.MYSQL_PASSWORD,
    multipleStatements: config.multipleStatements ?? process.env.MYSQL_MULTIPLE_STATEMENTS ?? true,
    timezone: config.timezone ?? '+00:00', // UTC
    queryFormat: function (...args) { // see https://www.npmjs.com/package/mysql#custom-format
      const finalQuery = queryFormat.bind(this)(...args);
      log(finalQuery);
      return finalQuery;
    }
  };

  const sshConfig = ((() => {

    // SSH client options (all possible options are in ssh2 documentation)
    const sshOptions = Object.assign({
      host: process.env.DB_SSH_TUNNEL_HOST,
      port: process.env.DB_SSH_TUNNEL_PORT,
      username: process.env.DB_SSH_TUNNEL_USERNAME,
      privateKey: process.env.DB_SSH_TUNNEL_PRIVATE_KEY
    }, config.sshTunnel?.sshOptions);

    const serverOptions = Object.assign({
      host: '127.0.0.1'
    }, config.sshTunnel?.serverOptions);

    const forwardOptions = Object.assign({
      dstAddr: process.env.DB_SSH_TUNNEL_DST_ADDR ?? '127.0.0.1',
      dstPort: process.env.DB_SSH_TUNNEL_DST_PORT ?? 3306
    }, config.sshTunnel?.forwardOptionsLocal);

    const tunnelOptions = config.sshTunnel?.tunnelOptions;

    return {
      sshOptions,
      forwardOptions,
      tunnelOptions,
      serverOptions
    };
  })());

  const logLevel =
    config.logLevel ??
    (process.env.NODE_ENV === 'development' ? 'debug' : 'error');

  let
    pool = null,
    tunnelServer = null,
    status = 'disconnected';

  async function connect() {

    if (status !== 'disconnected') {
      console.info(`connect() bailed due to "${status}" status...`);
      throw `connect() bailed due to "${status}" status...`;
    }

    status = 'connecting';

    if (sshConfig.sshOptions?.host) {
      const { server } = await establishTunnel(sshConfig);
      poolConfig.host = sshConfig.serverOptions.host;
      poolConfig.port = server.address().port;
      tunnelServer = server;
    }

    pool = mysql.createPool(poolConfig);
    pool.on('connection', (conn) => {
      // https://medium.com/@magnusjt/gotcha-timezones-in-nodejs-and-mysql-b39e418c9d3
      conn.query(
        /*sql*/ `
        SET
          time_zone='${poolConfig.timezone}',
          group_concat_max_len = 16384;
      `,
        (error) => {
          if (error) {
            throw error;
          }
        }
      );
    });

    // make sure we're connected
    const result = await pool.query('SELECT 1;').catch(error => ({ error }));
    if (result.error) {

      status = 'disconnected';

      log('error connecting to the db');

      throw (result.error);
    }

    status = 'connected';

    log('connected to db');
  }

  async function query(...args) {

    if ((config.lazyConnect ?? true) && (status !== 'connected')) {
      await connect();
    }

    // pool.query is a shortcut for the pool.getConnection() -> connection.query() -> connection.release()
    const [results /*, results_meta */] = await pool.query
      .apply(pool, args)
      .catch((error) => [{ error }]);

    if (results.error) {
      const error = results.error;
      await pool.query('ROLLBACK;'); //TODO: rollback only state mutating querys and\or transactions

      if (process.env.NODE_ENV === 'production') {
        error.rawMessage = error.message;
        error.message = 'SQL error'; // obfuscate error message
      }

      throw error;
    }

    convertColumnNameCasing(results);
    return results;
  }

  async function disconnect() {
    if (pool) {
      try {
        status = 'disconnecting';
        await pool.end();
      } catch (error) {
        // do nothing
      }
      pool = null;
      status = 'disconnected';
    }

    if (tunnelServer) {
      tunnelServer.close();
      tunnelServer = null;
    }
  }

  async function establishTunnel(sshConfig) {

    const privateKeyFile = config.sshTunnel?.privateKeyFile ?? process.env.DB_SSH_TUNNEL_PRIVATE_KEY_FILE;
    if (!sshConfig.sshOptions.privateKey && privateKeyFile) {
      sshConfig.sshOptions.privateKey = await readFile(privateKeyFile, 'utf8');
    }
    const [server, sshConnection] = await createTunnel(sshConfig.tunnelOptions, sshConfig.serverOptions, sshConfig.sshOptions, sshConfig.forwardOptions);

    // Use a listener to handle errors outside the callback
    server.on('error', error => {
      log('error in ssh tunnel');
    });

    log('SSH tunnel established');

    return ({ server, sshConnection });
  }

  function log(...args) {
    if (logLevel === 'debug') {
      console.info('[mysql]', ...args);
    }
  }

  return { connect, query, disconnect };
}


module.exports = init;
