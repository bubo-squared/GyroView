import { readSampleTable } from '../application/recording/readSampleTable';
import { SourceByteStream } from '../application/download/SourceByteStream';
import { startFileDownload, type DownloadedFile } from '../application/download/startFileDownload';
import { downloadPolicyFor } from '../domain/download/DownloadPolicy';
import type { CodecReader } from '../ports/CodecReader';
import { InMemoryRandomAccessSource } from './InMemoryRandomAccessSource';

/**
 * A file held in memory, opened as the player opens a recording's file (its sample table read,
 * its codecs told, its download started and reading ahead), for tests that need its real
 * packets or samples.
 */
export async function openDownloadedFile(
  bytes: Uint8Array,
  codecReader: CodecReader,
): Promise<DownloadedFile> {
  const source = new InMemoryRandomAccessSource(bytes);
  const { table, movieBytes } = await readSampleTable(source);
  const codecs = await codecReader.read(movieBytes);
  const policy = downloadPolicyFor({ size: bytes.byteLength, duration: table.duration }, 1);
  const file = startFileDownload({ table, stream: new SourceByteStream(source), codecs, policy });
  file.download.startReadingAhead();
  return file;
}
