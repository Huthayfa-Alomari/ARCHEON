import fs from "node:fs/promises";
import path from "node:path";
import { ingestOpenBookUrl } from "./book-ingest";

type Book = { id: string; title: string; author: string; year: number; url: string; landing: string; license: string; tags: string[] };
type Library = { version: number; note: string; books: Book[] };

async function load(): Promise<Library> {
  const file = path.resolve(process.cwd(), "data/trading-library.json");
  return JSON.parse(await fs.readFile(file, "utf8")) as Library;
}

export async function listTradingLibrary() { return load(); }

export async function ingestTradingLibraryBook(id: string) {
  const lib = await load();
  const book = lib.books.find((x) => x.id === id);
  if (!book) throw new Error(`Unknown trading library book: ${id}`);
  const result = await ingestOpenBookUrl({ url: book.url, title: `${book.title} — ${book.author}`, license: book.license, tags: ["trading", ...book.tags] });
  return { book, result };
}
