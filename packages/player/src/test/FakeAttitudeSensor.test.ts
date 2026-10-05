import { describeAttitudeSensorContract } from './attitudeSensorContract';
import { FakeAttitudeSensor } from './FakeAttitudeSensor';

describeAttitudeSensorContract('fake', () => {
  const sensor = new FakeAttitudeSensor('unavailable');
  return {
    sensor,
    reportAttitude: (): void => {
      sensor.report(0, [0, 0, 0]);
    },
  };
});
