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
INNER JOIN (
  SELECT tv_shows.id FROM tv_shows
  WHERE
    `title` = 'Mr.Robot' AND
    `year` = 2017
) filtered_tv_shows ON filtered_tv_shows.id = tv_shows.id
GROUP BY tv_shows.id
ORDER BY `updated_at` 'ASC'
LIMIT 30, 15;

SELECT
  2 AS page,
  15 AS resultsPerPage,
  COUNT(tv_shows.id) AS total_results,
  'updatedAt' AS sortBy
FROM tv_shows;
