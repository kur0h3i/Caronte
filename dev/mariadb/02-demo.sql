-- Tabla demo con tipos que Chinook no tiene (enum, json, bool, datetime).
USE `Chinook`;

CREATE TABLE `TrackReview`
(
    `ReviewId`   INT NOT NULL,
    `TrackId`    INT NOT NULL,
    `CustomerId` INT NOT NULL,
    `Rating`     TINYINT NOT NULL,
    `Mood`       ENUM ('love', 'like', 'meh', 'dislike') NOT NULL,
    `Verified`   BOOLEAN NOT NULL,
    `Details`    JSON NULL,
    `CreatedAt`  DATETIME NOT NULL,
    `Comment`    TEXT NULL,
    CONSTRAINT `PK_TrackReview` PRIMARY KEY (`ReviewId`),
    CONSTRAINT `FK_TrackReviewTrackId` FOREIGN KEY (`TrackId`) REFERENCES `Track` (`TrackId`),
    CONSTRAINT `FK_TrackReviewCustomerId` FOREIGN KEY (`CustomerId`) REFERENCES `Customer` (`CustomerId`)
);

INSERT INTO `TrackReview`
SELECT g,
       (g * 37) % 3503 + 1,
       (g * 13) % 59 + 1,
       (g * 7) % 5 + 1,
       ELT((g % 4) + 1, 'love', 'like', 'meh', 'dislike'),
       g % 3 <> 0,
       IF(g % 5 = 0, NULL,
          JSON_OBJECT('source', ELT((g % 3) + 1, 'web', 'app', 'api'),
                      'plays', (g * 11) % 200,
                      'tags', JSON_ARRAY(CONCAT('tag', g % 7), CONCAT('tag', g % 5)))),
       NOW() - INTERVAL ((g * 7919) % 730) DAY - INTERVAL ((g * 97) % 86400) SECOND,
       IF(g % 4 = 0, NULL, CONCAT('Comentario de prueba ', g))
FROM (WITH RECURSIVE seq(g) AS (SELECT 1 UNION ALL SELECT g + 1 FROM seq WHERE g < 1000)
      SELECT g FROM seq) AS s;
