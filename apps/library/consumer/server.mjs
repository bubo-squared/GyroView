// What a server rendering a page does with the package: imports it where there is no DOM, to
// render the element's tag or to read a recording's metadata. Run by the build: importing must
// not throw, and defining the element must do nothing there.
import { defineGyroView, inspectRecording } from '@bubo-squared/gyroview';
import '@bubo-squared/gyroview/define';
import '@bubo-squared/gyroview/standalone';

defineGyroView();
if (typeof inspectRecording !== 'function') {
  throw new TypeError('@bubo-squared/gyroview exports no inspectRecording');
}
