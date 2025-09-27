const
  Handlebars = require('handlebars'),
  { camelCase, snakeCase } = require('change-case'),
  { default: endent } = require('endent');

// see https://www.npmjs.com/package/mysql#custom-format
function queryFormat(query, values) {
  if (!values || (values?.length === 0)) { return query; }

  const poolConnection = this;
  const escape = poolConnection.escape.bind(this);
  const escapeId = poolConnection.escapeId.bind(this);

  function bindQueryParams(sql, values) {
    return sql

      // formatting identifiers
      .replace(/\B::(\w+)/g, function (match, key) {
        if (values.hasOwnProperty(key)) {
          return values[key]?.split('.')?.map(part => escapeId(snakeCase(part)))?.join('.');
        }
        return match;
      })

      // formatting values
      .replace(/\B:(\w+)/g, function (match, key) {
        if (values.hasOwnProperty(key)) {
          return escape(values[key]);
        }
        return match;
      });
  }

  // create handlebars parser for sql blocks
  Handlebars.registerHelper('sql', function (items, options) {
    return (Array.isArray(items) ? items : [items])
      .map(item => bindQueryParams(options.fn(item), item)).join('\n');
  });

  Handlebars.registerHelper('sqlEscapeId', function (id) {
    return bindQueryParams('::id', { id });
  });

  Handlebars.registerHelper('sqlEscape', function (value) {
    return bindQueryParams(':value', { value });
  });

  const finalQuery = (
    bindQueryParams(
      Handlebars.compile(query, {
        strict: true,
        noEscape: true,
        ignoreStandalone: true,
        preventIndent: true
      })(values),
      values
    ).split(';').map(v => endent(v)).join(';\n\n')
  );

  return finalQuery;
}

function convertColumnNameCasing(results) {
  if (!Array.isArray(results)) {
    return;
  }
  for (const result of results) {
    if (Array.isArray(result)) {
      convertColumnNameCasing(result);
    } else if (result.constructor.name !== 'ResultSetHeader') {
      for (const key in result) {
        if (key !== camelCase(key)) {
          result[camelCase(key)] = result[key];
          delete result[key];
        }
      }
    }
  }
}

module.exports = {
  queryFormat,
  convertColumnNameCasing
};
