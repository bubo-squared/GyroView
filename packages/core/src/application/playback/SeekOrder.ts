import { isFlowing, type PlayerState } from '../../domain/playback/PlayerState';

/**
 * A scrub's place in line: the seek it began after and its own number among the scrubs.
 */
export interface ScrubTicket {
  readonly seek: number;
  readonly scrub: number;
}

/**
 * The seeks of a session in order: one that a listener's seek overtook while it was announced
 * stops there, and a seek made while another is announced resumes as that one would have. A scrub
 * lands only if no seek or scrub came after it while it looked up its key frame.
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
   * A new seek, begun from `state`; overtaking one still announced, it begins from what that one
   * began from.
   */
  public begin(state: PlayerState): number {
    if (state !== 'seeking') this.isFromFlowing = isFlowing(state);
    this.generation += 1;
    return this.generation;
  }

  public isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  public claimScrub(): ScrubTicket {
    this.scrubs += 1;
    return { seek: this.generation, scrub: this.scrubs };
  }

  public isScrubCurrent(ticket: ScrubTicket): boolean {
    return ticket.seek === this.generation && ticket.scrub === this.scrubs;
  }
}
