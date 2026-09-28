import { isFlowing, type PlayerState } from '../../domain/playback/PlayerState';

/**
 * A scrub's place in line: the seek it began after and its own number among the scrubs.
 */
export interface ScrubTicket {
  readonly seek: number;
  readonly scrub: number;
}

/**
 * The seeks of a session in order, and whether the latest resumes playing. A scrub lands only if
 * no seek or scrub came after it while it looked up its key frame.
 */
export class SeekOrder {
  private generation = 0;
  private scrubs = 0;
  private isFromFlowing = false;

  /**
   * Whether the seek under way resumes playing once its frames are ready.
   */
  public get resumesPlaying(): boolean {
    return this.isFromFlowing;
  }

  /**
   * A new seek, begun from `state`.
   */
  public begin(state: PlayerState): void {
    this.isFromFlowing = isFlowing(state);
    this.generation += 1;
  }

  public claimScrub(): ScrubTicket {
    this.scrubs += 1;
    return { seek: this.generation, scrub: this.scrubs };
  }

  public isScrubCurrent(ticket: ScrubTicket): boolean {
    return ticket.seek === this.generation && ticket.scrub === this.scrubs;
  }
}
