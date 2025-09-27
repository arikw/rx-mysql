const
  chai = require('chai'),
  fs = require('fs'),
  path = require('path'),
  mock = require('mock-require'),
  { escape, escapeId } = require('mysql2/promise'),

  expect = chai.expect;

let
  lastDatabaseQuery = null,
  lastNormalizedDatabaseQuery = null,
  db;

describe('templating and bind variables', () => {

  before(async () => {

    const { queryFormat } = require('../src/helpers.js');

    mock('mysql2/promise', {
      createPool: () => ({
        query: async (...args) => {
          lastDatabaseQuery = queryFormat.apply({ escape, escapeId }, args);
          lastNormalizedDatabaseQuery = normalizeQueryString(lastDatabaseQuery);
          return [[]];
        },
        on: () => {}
      })
    });

    db = (await require('../src/index.js')()).getInstance();

  });

  after(() => {
    mock.stopAll();
  });

  it('final query as expected', async () => {

    await db.query(/*sql*/`
      SELECT
        ANY_VALUE(tv_shows.id) AS id,
        ANY_VALUE(tv_shows.sort_priority) AS sort_priority,
        ANY_VALUE(tv_shows.author) AS author,
        JSON_OBJECTAGG(CONCAT_WS('-', language_code, NULLIF(country_code, '')), JSON_OBJECT('title', episodes.title)) as locales,
        ANY_VALUE(tv_shows.updated_at) AS updated_at,
        ANY_VALUE(tv_shows.created_at) AS created_at
      FROM tv_shows
      LEFT JOIN episodes ON
        episodes.show_id = tv_shows.id

      {{~#if search}}
      -- search criteria
      INNER JOIN (
        SELECT tv_shows.id FROM tv_shows
        WHERE
        {{~#each search}}
          {{sqlEscapeId @key}} = {{sqlEscape this}} {{#unless @last~}}AND{{/unless~}}
        {{/each}}
      ) filtered_tv_shows ON filtered_tv_shows.id = tv_shows.id
      {{/if}}

      GROUP BY tv_shows.id
      ORDER BY ::sortBy :sortDirection
      LIMIT :offset, :count;

      SELECT
        :page AS page,
        :count AS resultsPerPage,
        COUNT(tv_shows.id) AS total_results,
        :sortBy AS sortBy
      FROM tv_shows;
  `, {
      count: 15,
      page: 2,
      offset: 30,
      sortBy: 'updatedAt',
      sortDirection: 'ASC',
      search: {
        title: 'Mr.Robot',
        year: 2017
      }
    });
    expect(readAndNormalizeQueryFile('./queries/tv-shows.sql'), 'got unexpected db query').to.be.equal(lastNormalizedDatabaseQuery);

  });
});

function normalizeQueryString(query) {
  return query
    .replace(/\r/g, '') // convert crlf to lf
    .replace(/^\s*--\s.*$/gm, '') // remove sql comments
    .replace(/^\s*$/gm, '') // trim empty lines
    .replace(/^\s*/gm, '') // trim leading whitespaces
    .replace(/\s*$/gm, '') // trim line end whitespaces
    .replace(/\n+/gm, '\n'); // remove empty lines
}

function readAndNormalizeQueryFile(relativePath) {
  return normalizeQueryString(fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8'));
}
