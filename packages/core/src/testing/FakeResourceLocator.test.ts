import { FakeResourceLocator } from './FakeResourceLocator';
import { describeResourceLocatorContract } from './ResourceLocator.contract';

const EXISTING = 'https://media.example/VID_20260814_132640_10_013.insv';

describeResourceLocatorContract(() =>
  Promise.resolve({
    locator: new FakeResourceLocator([EXISTING]),
    existing: EXISTING,
    missing: 'https://media.example/VID_20260814_132640_10_014.insv',
  }),
);
