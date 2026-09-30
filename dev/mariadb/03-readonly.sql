-- Usuario de solo lectura para Caronte.
CREATE USER 'caronte_ro'@'%' IDENTIFIED BY 'caronte_ro';
GRANT SELECT, SHOW VIEW ON `Chinook`.* TO 'caronte_ro'@'%';
FLUSH PRIVILEGES;

ANALYZE TABLE `Chinook`.`Album`, `Chinook`.`Artist`, `Chinook`.`Customer`, `Chinook`.`Employee`,
    `Chinook`.`Genre`, `Chinook`.`Invoice`, `Chinook`.`InvoiceLine`, `Chinook`.`MediaType`,
    `Chinook`.`Playlist`, `Chinook`.`PlaylistTrack`, `Chinook`.`Track`, `Chinook`.`TrackReview`;
