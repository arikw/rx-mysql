# rx-mysql

An opinionated MySQL driver for Node.js, offering intuitive query handling, secure database connections, and efficient data management with minimal setup.

## Features

- **Intuitive Bind Variables with Escaping:** Safely bind variables to your SQL queries with automatic escaping, reducing the risk of SQL injection.
- **Query Formatting with Handlebars Templates:** Utilize Handlebars templates for dynamic query generation, enabling complex SQL constructions with ease. The `queryFormat` function has been updated to gracefully handle cases where the `values` array is empty, preventing errors and improving robustness.
- **SSH Tunneling:** Establish secure database connections through SSH tunnels, ensuring your database interactions are encrypted and protected.
- **Connection Pooling:** Leverages connection pooling by default, optimizing database interactions for performance and scalability.
- **Auto-conversion to camelCase:** Automatically convert database column names to camelCase for seamless integration with JavaScript codebases.
- **Environment-based Configuration:** Automatically pick up connection details from environment variables.
- **Lazy Connection:** Lazy connect to the DB upon first query

## Installation

Install `rx-mysql` version 2.0.0 or later using npm:

```bash
npm install rx-mysql@latest
```

## Usage

### Basic Example

```javascript
const mysql = require('rx-mysql');

async function main() {
  // Initialize the database connection
  const { query, beginTransaction, connect, disconnect } = await mysql(/* ...options */);

  const results = await query('SELECT * FROM myTable WHERE id = :id', { id: 1 });
  console.log(results);

  // Transaction:
  const transaction = await beginTransaction();
  try {
    await transaction.query('INSERT INTO users (name) VALUES (:name)', { name: 'Jane Doe' });
    await transaction.query('UPDATE products SET stock = stock - 1 WHERE id = :id', { id: 101 });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error('Transaction failed and was rolled back:', error);
  }

  await disconnect(); // Use the disconnect method from the returned object
}

main();
```

### Direct DB Connection

```javascript
const db = mysql({
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  user: 'user',
  password: 'entersesame'
});
```

### Query Configuration

The `query` function accepts an optional `queryConfig` object as its last argument, allowing you to customize query behavior.

#### `queryConfig` Options

- `nativeQuery` (boolean): If `true`, the query will be executed as a native MySQL query without any `rx-mysql` specific processing (e.g., camelCase conversion). When `nativeQuery` is `true`, the result format will be the raw output from the MySQL driver (e.g., `[ [...rows], [...fields] ]` for `SELECT` queries), and `keepOriginalCasing` will be ignored as no casing conversion is performed. Defaults to `false`.
- `keepOriginalCasing` (boolean): If `true`, the column names in the query results will retain their original casing from the database. This option is only effective when `nativeQuery` is `false`. Defaults to `false` (converts to camelCase).

#### Example with `queryConfig`

```javascript
const { query } = await mysql();

// Example with nativeQuery:
// The result will be the raw output from the MySQL driver.
const nativeResults = await query(
  'SELECT user_id, user_name FROM users',
  null,
  { nativeQuery: true }
);
console.log(nativeResults); // Example: [ [ { user_id: 1, user_name: 'John Doe' } ], [ ...fields ] ]

// Example with keepOriginalCasing (nativeQuery is false by default):
const casingResults = await query(
  'SELECT user_id, user_name FROM users',
  null,
  { keepOriginalCasing: true }
);
console.log(casingResults); // Example: [{ user_id: 1, user_name: 'John Doe' }]

// Default behavior (nativeQuery: false, keepOriginalCasing: false):
const defaultResults = await query(
  'SELECT user_id, user_name FROM users',
  null
);
console.log(defaultResults); // Example: [{ userId: 1, userName: 'John Doe' }]
```

### Using SSH Tunnel

```javascript
// open an ssh tunnel to a server at 123.1.2.3:22
// redirect all trafic that enters the tunnel to port 3377 on the remote server
// and then connect to the remote DB via the tunnel
const db = mysql({
  database: 'mydb',
  user: 'user',
  password: 'entersesame',
  sshTunnel: {
    sshOptions: {
      host: '123.1.2.3',
      port: 22,
      username: 'root',
      privateKeyFile: '/path/to/certs/id_rsa'
    },
    forwardOptions: {
      dstAddr: 'localhost',
      dstPort: 3377
    }
  }
});
```

## Configuration Options

`rx-mysql` is designed to be flexible, supporting direct configuration in code as well as configuration through environment variables. This section details the available configuration options and their corresponding environment variables.

### Direct Configuration vs. Environment Variables

You can configure `rx-mysql` by passing an options object when initializing the module or by setting environment variables. Direct configuration in code offers more granularity and is suitable for projects where configuration may vary dynamically at runtime. Environment variables are ideal for containerized environments or scenarios where you wish to separate configuration from code, such as in different development, staging, and production environments.

### Configuration Options and Defaults

Below is a comprehensive list of available configuration options, their corresponding environment variables, and the default values used by `rx-mysql` when no value is specified.

| Environment Variable            | Direct Configuration Path          | Default Value      | Description                                                   |
|---------------------------------|------------------------------------|--------------------|---------------------------------------------------------------|
| `MYSQL_HOST`                    | `host`                             | `'localhost'`      | Database host address.                                        |
| `MYSQL_DATABASE`                | `database`                         | None               | The name of the database.                                     |
| `MYSQL_USER`                    | `user`                             | None               | The username for database authentication.                     |
| `MYSQL_PASSWORD`                | `password`                         | None               | The password for database authentication.                     |
| `MYSQL_PORT`                    | `port`                             | `3306`             | Database port.                                                |
| `MYSQL_MAX_EXECUTION_TIME`      | `maxExecutionTime`                 | `30000`            | Maximum time in milliseconds for a query to execute.          |
| `MYSQL_LAZY_CONNECT`            | `lazyConnect`                      | `true`             | Whether to connect to the database only on the first query.   |
| `MYSQL_LOG_LEVEL`               | `logLevel`                         | `'debug' (dev) / 'error' (prod)` | Logging level for database operations.                        |
| `MYSQL_CONNECTION_LIMIT`        | `connectionLimit`                  | `15`               | Maximum number of connections in the pool.                    |
| `MYSQL_TEST_MODE`               | `testMode`                         | `false`            | Enables test mode, exposing utility methods for testing.      |
| `DB_SSH_TUNNEL_HOST`            | `sshTunnel.sshOptions.host`        | None               | The SSH server host for SSH tunneling.                        |
| `DB_SSH_TUNNEL_PORT`            | `sshTunnel.sshOptions.port`        | `22`               | The SSH server port.                                          |
| `DB_SSH_TUNNEL_USERNAME`        | `sshTunnel.sshOptions.username`    | `'root'`           | The username for SSH authentication.                          |
| `DB_SSH_TUNNEL_PRIVATE_KEY_FILE`| `sshTunnel.privateKeyFile`         | None               | Path to the SSH private key file.                             |
| `DB_SSH_TUNNEL_DST_ADDR`        | `sshTunnel.forwardOptions.dstAddr` | `'127.0.0.1'`      | The destination address for the SSH tunnel.                   |
| `DB_SSH_TUNNEL_DST_PORT`        | `sshTunnel.forwardOptions.dstPort` | `3306`             | The destination port for the SSH tunnel.                      |

*Note: The default values are used when neither direct configuration nor environment variables specify a value. Certain defaults, such as `MYSQL_PORT` and `DB_SSH_TUNNEL_PORT`, align with commonly used standards for MySQL and SSH connections, respectively. For fields without a default value, either direct configuration or an environment variable must be provided to ensure proper operation of `rx-mysql`.*

### Example Configuration

#### Direct Configuration

```javascript
const db = mysql({
  host: 'example.com', // Defaults to 'localhost'
  database: 'my_database',
  user: 'db_user',
  password: 'db_password',
  sshTunnel: {
    sshOptions: {
      host: 'ssh.example.com',
      username: 'ssh_user', // Defaults to 'root'
      privateKey: 'contents_of_private_key'
    },
    forwardOptions: {
      dstAddr: '127.0.0.1', // Defaults to '127.0.0.1'
      dstPort: 3306 // Defaults to 3306
    }
  }
});
```

#### Configuration with Environment Variables

```bash
export MYSQL_HOST=example.com # Default is 'localhost'
export MYSQL_DATABASE=my_database
export MYSQL_USER=db_user
export MYSQL_PASSWORD=db_password
export DB_SSH_TUNNEL_HOST=ssh.example.com
export DB_SSH_TUNNEL_USERNAME=ssh_user # Default is 'root'
export DB_SSH_TUNNEL_PRIVATE_KEY_FILE=/path/to/private/key
export DB_SSH_TUNNEL_DST_ADDR=127.0.0.1 # Default is '127.0.0.1'
export DB_SSH_TUNNEL_DST_PORT=3306 # Default is 3306
```

## SSH Tunneling Configuration

`rx-mysql` integrates seamlessly with the `tunnel-ssh` package to establish secure SSH tunnels for database connections. This feature is particularly useful for securely connecting to remote databases over insecure networks or when direct database access is restricted.

### Configuration Overview

SSH tunneling configuration in `rx-mysql` is divided into several parts, closely following the structure provided by `tunnel-ssh`:

- **Tunnel Options:** Controls the overall behavior of the SSH tunnel.
- **Server Options:** Specifies the TCP server options on the local machine.
- **SSH Client Options:** Details on how to connect to the SSH server.
- **Forwarding Options:** Manages the source and destination of the tunnel.

### Environment Variables and Direct Configuration

`rx-mysql` allows configuring SSH tunneling using both environment variables and direct configuration in code. Below is how environment variables map to direct configuration options:

#### SSH Client Options

- **Env Var to Direct Config Mapping:**
  - `DB_SSH_TUNNEL_HOST` -> `sshOptions.host`
  - `DB_SSH_TUNNEL_PORT` -> `sshOptions.port` (default: `22`)
  - `DB_SSH_TUNNEL_USERNAME` -> `sshOptions.username` (default: `root`)
  - `DB_SSH_TUNNEL_PRIVATE_KEY_FILE` -> `sshOptions.privateKey` (provide the private key content directly)

#### Forwarding Options

- **Env Var to Direct Config Mapping:**
  - `DB_SSH_TUNNEL_DST_HOST` -> `forwardOptions.dstAddr` (default: `127.0.0.1`)
  - `DB_SSH_TUNNEL_DST_PORT` -> `forwardOptions.dstPort`

#### Example Direct Configuration

```javascript
const db = mysql({
  database: 'mydb',
  user: 'user',
  password: 'password',
  sshTunnel: {
    sshOptions: {
      host: '123.1.2.3',
      port: 22,
      username: 'root',
      privateKey: 'PRIVATE_KEY_CONTENTS'
    },
    forwardOptions: {
      dstAddr: 'localhost',
      dstPort: 3306
    },
    tunnelOptions: {
      autoClose: true
    },
    serverOptions: {
      host: '127.0.0.1',
      port: 27017 // Use 0 for automatic port assignment
    }
  }
});
```

This configuration establishes an SSH tunnel from the local machine to the remote database server, securely forwarding local TCP port `27017` to the database port `3306` on the server at `localhost`.

For detailed options and additional configuration, refer to the `tunnel-ssh` and `ssh2` documentation.

## Transactions

`rx-mysql` now supports database transactions, allowing you to execute a series of database operations as a single atomic unit. This ensures data integrity by either committing all changes or rolling back all changes if any operation fails.

### `beginTransaction` Method

The `beginTransaction` method initiates a new transaction. It returns a transaction object with `query`, `commit`, and `rollback` methods.

```javascript
const mysql = require('rx-mysql');

async function main() {
  const { getInstance, disconnect } = await mysql();
  const db = getInstance();

  let transaction;
  try {
    transaction = await db.beginTransaction();

    // Execute queries within the transaction
    await transaction.query('INSERT INTO users (name) VALUES (:name)', { name: 'John Doe' });
    await transaction.query('UPDATE products SET stock = stock - 1 WHERE id = :id', { id: 101 });

    await transaction.commit();
    console.log('Transaction committed successfully.');
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
      console.log('Transaction rolled back due to error:', error);
    } else {
      console.error('Error starting transaction:', error);
    }
  } finally {
    await disconnect();
  }
}

main();
```

## Migration Guide

This section details the breaking changes introduced in `rx-mysql` version 2.0.0 and provides clear instructions for upgrading from previous versions (1.x).

### Initialization returns value and exposed pool methods

The initialization function is now `async` and returns an object with `pool` object, and now also directly exposes several methods for convenience: `connect`, `disconnect`, `query`, `beginTransaction`, `escape`, `escapeId`, `format`, and `getConnection`.

**Before (1.x):**
```javascript
const db = mysql(/* ...options */);
```

**After (2.x):**
```javascript
const { query, beginTransaction, disconnect } = await mysql(/* ...options */);
// Use the pool directly for querying and other operations
const results = await query('SELECT * FROM myTable');
```

### `query` function with `queryConfig`

The `query` function now accepts an optional `queryConfig` object as its *last* argument, which can include `nativeQuery` and `keepOriginalCasing` options.

**Before (1.x):**
```javascript
db.query('SELECT * FROM users', values);
```

**After (2.x):**
```javascript
db.query('SELECT * FROM users', values, { nativeQuery: true, keepOriginalCasing: false });
// or if no queryConfig is needed, you can still call it as before:
db.query('SELECT * FROM users', values);
```

### SSH Tunneling Configuration

The `sshTunnel.forwardOptionsLocal` configuration path has been changed to `sshTunnel.forwardOptions`.

**Before (1.x):**
```javascript
sshTunnel: {
  // ...
  forwardOptionsLocal: {
    dstAddr: 'localhost',
    dstPort: 3377
  }
}
```

**After (2.x):**
```javascript
sshTunnel: {
  // ...
  forwardOptions: {
    dstAddr: 'localhost',
    dstPort: 3377
  }
}
```

## Testing

To enable test mode, set the environment variable `MYSQL_TEST_MODE` to `true`. When in test mode, `rx-mysql` exposes several methods for inspecting and manipulating query results without actually hitting a database. This is useful for testing your application's database interactions.

### Enabling Test Mode

To enable test mode, pass `testMode: true` to the `mysql()` initialization function:

```javascript
const mysql = require('rx-mysql');
// The 'mysql' variable here is the init function exported by 'src/db.js'
const { query, beginTransaction, disconnect, clearAll } = await mysql({
  testMode: true
});
// ... your test code
```

### Test Utility Methods

When `MYSQL_TEST_MODE` is enabled, the `rx-mysql` instance returned by `await mysql()` will include the following additional methods:

#### `getLastQuery()`

Returns the last executed query object, which includes the SQL string and the bound values.

```javascript
const { query, getLastQuery } = await mysql({ testMode: true });
await query('SELECT * FROM users WHERE id = :id', { id: 1 });
const lastQuery = getLastQuery();
console.log(lastQuery);
// Expected output: 'SELECT * FROM users WHERE id = 1'
```

#### `setResultsByMatch(match, results)`

Configures the test mode to return specific `results` when a query matching the provided `match` (a regex or string) is executed.

```javascript
const { query, setResultsByMatch } = await mysql({ testMode: true });
setResultsByMatch([
  { regex: /^SELECT\s/, result: [{ id: 1, name: 'Test User' }, { id: 2, name: 'Test User2' }] },
  { regex: /.*/, result: [{}] }
]);
const users = await query('SELECT * FROM users');
console.log(users);
// Expected output: [{ id: 1, name: 'Test User' }, { id: 2, name: 'Test User2' }]
```

#### `getLastTransaction()`

Returns the last transaction object, allowing inspection of queries executed within it.

```javascript
const { beginTransaction, getLastTransaction } = await mysql({ testMode: true });
const transaction = await beginTransaction();
await transaction.query('INSERT INTO logs (message) VALUES (:message)', { message: 'Test log' });
await transaction.commit();
const lastTransaction = getLastTransaction();
console.log(lastTransaction.queries[0]);
// Expected output: "START TRANSACTION; INSERT INTO logs (message) VALUES ('Test log'); COMMIT;"
```

#### Clearing Test State

The following methods are available to clear the internal test state:

- `clearLastQuery()`: Clears the last stored query.
- `clearResultsByMatch()`: Clears all configured query match results.
- `clearLastTransaction()`: Clears the last stored transaction.
- `clearAll()`: Clears all of the above test states (last query, results by match, and last transaction).

```javascript
const { clearAll, getLastQuery } = await mysql({ testMode: true });
// ... perform some queries
clearAll();
const lastQuery = getLastQuery();
console.log(lastQuery);
// Expected output: null
```

## Contributing

Contributions are welcome! If you'd like to contribute, please fork the repository and submit a pull request.

## License

This project is licensed under the MIT License - see the `LICENSE.md` file for details.
