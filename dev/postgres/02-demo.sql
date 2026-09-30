-- Tabla demo con tipos que Chinook no tiene (enum, json, bool, timestamp).
\c chinook

CREATE TYPE review_mood AS ENUM ('love', 'like', 'meh', 'dislike');

CREATE TABLE track_review
(
    review_id   INT PRIMARY KEY,
    track_id    INT NOT NULL REFERENCES track (track_id),
    customer_id INT NOT NULL REFERENCES customer (customer_id),
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    mood        review_mood NOT NULL,
    verified    BOOLEAN NOT NULL,
    details     JSONB,
    created_at  TIMESTAMP NOT NULL,
    comment     TEXT
);

INSERT INTO track_review
SELECT g,
       (g * 37) % 3503 + 1,
       (g * 13) % 59 + 1,
       (g * 7) % 5 + 1,
       (ARRAY ['love', 'like', 'meh', 'dislike'])[(g % 4) + 1]::review_mood,
       g % 3 <> 0,
       CASE
           WHEN g % 5 = 0 THEN NULL
           ELSE jsonb_build_object(
                   'source', (ARRAY ['web', 'app', 'api'])[(g % 3) + 1],
                   'plays', (g * 11) % 200,
                   'tags', jsonb_build_array('tag' || (g % 7), 'tag' || (g % 5)))
           END,
       date_trunc('second', now()::timestamp)
           - ((g * 7919) % 730) * INTERVAL '1 day'
           - ((g * 97) % 86400) * INTERVAL '1 second',
       CASE WHEN g % 4 = 0 THEN NULL ELSE 'Comentario de prueba ' || g END
FROM generate_series(1, 1000) AS g;
