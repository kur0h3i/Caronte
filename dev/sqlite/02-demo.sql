-- Tabla demo con tipos que Chinook no tiene (json, bool, datetime y un "enum" por CHECK).
CREATE TABLE [TrackReview]
(
    [ReviewId]   INTEGER NOT NULL PRIMARY KEY,
    [TrackId]    INTEGER NOT NULL REFERENCES [Track] ([TrackId]),
    [CustomerId] INTEGER NOT NULL REFERENCES [Customer] ([CustomerId]),
    [Rating]     INTEGER NOT NULL,
    [Mood]       VARCHAR(10) NOT NULL CHECK ([Mood] IN ('love', 'like', 'meh', 'dislike')),
    [Verified]   BOOLEAN NOT NULL,
    [Details]    JSON,
    [CreatedAt]  DATETIME NOT NULL,
    [Comment]    TEXT
);

WITH RECURSIVE seq(g) AS (SELECT 1 UNION ALL SELECT g + 1 FROM seq WHERE g < 1000)
INSERT INTO [TrackReview]
SELECT g,
       (g * 37) % 3503 + 1,
       (g * 13) % 59 + 1,
       (g * 7) % 5 + 1,
       CASE g % 4 WHEN 0 THEN 'love' WHEN 1 THEN 'like' WHEN 2 THEN 'meh' ELSE 'dislike' END,
       g % 3 <> 0,
       CASE
           WHEN g % 5 = 0 THEN NULL
           ELSE json_object(
                   'source', CASE g % 3 WHEN 0 THEN 'web' WHEN 1 THEN 'app' ELSE 'api' END,
                   'plays', (g * 11) % 200,
                   'tags', json_array('tag' || (g % 7), 'tag' || (g % 5)))
           END,
       datetime('now', '-' || ((g * 7919) % 730) || ' days', '-' || ((g * 97) % 86400) || ' seconds'),
       CASE WHEN g % 4 = 0 THEN NULL ELSE 'Comentario de prueba ' || g END
FROM seq;

ANALYZE;
