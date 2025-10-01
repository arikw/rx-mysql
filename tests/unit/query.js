const
  chai = require('chai'),
  dbHelpers = require('../helpers/db.js'),

  { expect } = chai;

let db = null;

describe('templating and bind variables', () => {

  before(async () => {
    db = await require('../../src/db.js')({
      testMode: true
    });
  });

  after(() => {
    db.clearAll();
    db = null;
  });

  it('final query as expected', async () => {
    db.setResultsByMatch([
      { regex: /.*/, result: [{}] }
    ]);

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
    expect(dbHelpers.getQueryFromFile('./unit/data/queries/tv-shows.sql'), 'got unexpected db query').to.be.equal(dbHelpers.normalizeQuery(db.getLastQuery()));
  });
});
