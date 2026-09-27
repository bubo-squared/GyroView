// What a server rendering a page does with the package: imports it where there is no DOM, to
// render the element's tag or to read a recording's metadata. Run by the build: importing must
// not throw, and defining the element must do nothing there.
import { defineGyroView, inspectRecording } from 'gyroview';
import 'gyroview/define';
import 'gyroview/standalone';

defineGyroView();
if (typeof inspectRecording !== 'function') {
  throw new TypeError('gyroview exports no inspectRecording');
}
