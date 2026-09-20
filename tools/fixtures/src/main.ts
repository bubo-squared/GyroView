import { readFixture, writeFixture } from './fixtureFiles';
import { assembleSyntheticRecording, type TrailerRecords } from './syntheticRecording';

/**
 * Each synthetic MP4 gets a sibling carrying the office X5 trailer records.
 */
const MEDIA_FIXTURES = ['dual-track-64px-10fps-3s.mp4', 'dual-track-aac-64px-10fps-3s.mp4'];
const OUTPUT_PREFIX = 'x5-trailer-';

async function officeRecords(): Promise<TrailerRecords> {
  const [info, gyro, exposure] = await Promise.all([
    readFixture('x5/office/record-01-info.bin'),
    readFixture('x5/office/record-03-gyro-first2000.bin'),
    readFixture('x5/office/record-04-exposure-first16.bin'),
  ]);
  return { info, gyro, exposure };
}

async function main(): Promise<void> {
  const records = await officeRecords();
  for (const name of MEDIA_FIXTURES) {
    const media = await readFixture(`synthetic/${name}`);
    const output = `synthetic/${OUTPUT_PREFIX}${name}`;
    await writeFixture(output, assembleSyntheticRecording(media, records));
    process.stdout.write(`wrote test/fixtures/${output}\n`);
  }
}

await main();
