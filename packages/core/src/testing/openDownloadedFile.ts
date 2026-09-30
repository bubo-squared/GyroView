import { readSampleTable } from '../application/recording/readSampleTable';
import { SourceByteStream } from '../application/download/SourceByteStream';
import { startFileDownload, type DownloadedFile } from '../application/download/startFileDownload';
import { downloadPolicyFor } from '../domain/download/DownloadPolicy';
import type { CodecReader } from '../ports/CodecReader';
import type { RandomAccessSource } from '../ports/RandomAccessSource';
import { InMemoryRandomAccessSource } from './InMemoryRandomAccessSource';

/**
 * A file held in memory, opened as the player opens a recording's file (its sample table read,
 * its codecs told, its download started and reading ahead), for tests that need its real
 * packets or samples.
 */
export function openDownloadedFile(
  bytes: Uint8Array,
  codecReader: CodecReader,
): Promise<DownloadedFile> {
  return openDownloadedSource(new InMemoryRandomAccessSource(bytes), codecReader);
}

/**
 * A file from any source, a file on disk as well, opened as {@link openDownloadedFile} opens one.
 */
export async function openDownloadedSource(
  source: RandomAccessSource,
  codecReader: CodecReader,
): Promise<DownloadedFile> {
  const { table, movieBytes } = await readSampleTable(source);
  const codecs = await codecReader.read(movieBytes);
  const policy = downloadPolicyFor({ size: await source.size(), duration: table.duration }, 1);
  const file = startFileDownload({ table, stream: new SourceByteStream(source), codecs, policy });
  file.download.startReadingAhead();
  return file;
}
