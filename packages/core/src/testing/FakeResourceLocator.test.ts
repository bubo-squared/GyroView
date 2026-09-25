import { FakeResourceLocator } from './FakeResourceLocator';
import { describeResourceLocatorContract } from './ResourceLocator.contract';

const EXISTING = 'https://media.example/clip.lrv';

describeResourceLocatorContract(() =>
  Promise.resolve({
    locator: new FakeResourceLocator([EXISTING]),
    existing: EXISTING,
    missing: 'https://media.example/other.lrv',
  }),
);
