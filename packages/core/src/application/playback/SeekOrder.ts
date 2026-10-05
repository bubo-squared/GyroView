/**
 * A scrub's place in line: the request it was, counted among every seek and scrub.
 */
export type ScrubTicket = number;

/**
 * The seeks of a session in order: whether the latest is still to show its first picture, and
 * whether a scrub is still the latest request once it has looked up its key frame. A scrub lands
 * only if no seek or scrub came after it meanwhile.
 */
export class SeekOrder {
  private requests = 0;
  private isPictureDue = false;

  /**
   * The latest seek has not drawn its first picture yet (ADR 0042).
   */
  public get isUnderWay(): boolean {
    return this.isPictureDue;
  }

  public begin(): void {
    this.requests += 1;
    this.isPictureDue = true;
  }

  /**
   * The seek under way is done, or will draw nothing (playback failed or stopped).
   */
  public finish(): void {
    this.isPictureDue = false;
  }

  public claimScrub(): ScrubTicket {
    this.requests += 1;
    return this.requests;
  }

  public isScrubCurrent(ticket: ScrubTicket): boolean {
    return ticket === this.requests;
  }
}
