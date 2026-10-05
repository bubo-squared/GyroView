/**
 * How long a frame whose page has loaded may take to say hello. The embed page says it while it
 * loads, from its own script, before its load event; the rest is a busy main thread.
 */
export const HELLO_DEADLINE_MS = 10_000;

/**
 * Tells a frame that loaded and never said hello: its page was not the embed page (a wrong
 * `embedPageUrl`, a 404), its host refused to be framed, or it would not talk to this page. The
 * embed page says hello while it loads, so its hello usually comes before the frame's load
 * event: a hello heard before a load answers that load, and one heard after it, in time, too.
 */
export class HelloWatch {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private hasHeardBeforeLoad = false;
  private hasGivenUp = false;

  public constructor(
    private readonly deadlineMs: number,
    private readonly giveUp: () => void,
  ) {}

  /**
   * The frame's document finished loading.
   */
  public loaded(): void {
    this.cancel();
    if (this.hasHeardBeforeLoad) {
      this.hasHeardBeforeLoad = false;
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.hasGivenUp = true;
      this.giveUp();
    }, this.deadlineMs);
  }

  /**
   * The frame said hello.
   */
  public heard(): void {
    const isAnswerToLoad = this.timer !== undefined || this.hasGivenUp;
    this.cancel();
    this.hasGivenUp = false;
    if (!isAnswerToLoad) this.hasHeardBeforeLoad = true;
  }

  public cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
