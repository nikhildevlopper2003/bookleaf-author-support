import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { db } from './index.js';
import { config } from '../config.js';

const ADMINS = [
  { email: 'admin@bookleaf.example', name: 'Support Admin' },
  { email: 'ops@bookleaf.example', name: 'Ops Team' },
];

export function seed() {
  const data = JSON.parse(fs.readFileSync(config.seedFile, 'utf8'));
  const authorHash = bcrypt.hashSync(config.seedAuthorPassword, 10);
  const adminHash = bcrypt.hashSync(config.seedAdminPassword, 10);

  const insAuthor = db.prepare(
    `INSERT OR IGNORE INTO authors (id, name, email, phone, city, joined_date)
     VALUES (@author_id, @name, @email, @phone, @city, @joined_date)`
  );
  const insUser = db.prepare(
    `INSERT OR IGNORE INTO users (email, password_hash, name, role, author_id)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insBook = db.prepare(
    `INSERT OR IGNORE INTO books (id, author_id, title, isbn, genre, publication_date, status, mrp,
       royalty_per_copy, copies_sold, royalty_earned, royalty_paid, royalty_pending,
       last_payout_date, print_partner, available_on)
     VALUES (@book_id, @author_id, @title, @isbn, @genre, @publication_date, @status, @mrp,
       @author_royalty_per_copy, @total_copies_sold, @total_royalty_earned, @royalty_paid,
       @royalty_pending, @last_royalty_payout_date, @print_partner, @available_json)`
  );

  const run = db.transaction(() => {
    for (const a of data.authors) {
      insAuthor.run(a);
      insUser.run(a.email.toLowerCase(), authorHash, a.name, 'author', a.author_id);
      for (const b of a.books) {
        insBook.run({ ...b, author_id: a.author_id, available_json: JSON.stringify(b.available_on ?? []) });
      }
    }
    for (const adm of ADMINS) insUser.run(adm.email, adminHash, adm.name, 'admin', null);
  });
  run();
}

// Allows `npm run seed`; the server also calls seed() on boot (idempotent).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed();
  console.log('Seed complete');
}
