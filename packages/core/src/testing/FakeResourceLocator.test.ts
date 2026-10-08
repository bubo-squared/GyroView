import { FakeResourceLocator } from './FakeResourceLocator';
import { describeResourceLocatorContract } from './ResourceLocator.contract';

const EXISTING = 'https://media.example/VID_20260814_132640_10_013.insv';
const UNANSWERED = 'https://media.example/VID_20260814_132640_10_015.insv';

describeResourceLocatorContract(() =>
  Promise.resolve({
    locator: new FakeResourceLocator([EXISTING], { unanswered: [UNANSWERED] }),
    existing: EXISTING,
    missing: 'https://media.example/VID_20260814_132640_10_014.insv',
    unanswered: UNANSWERED,
  }),
);
