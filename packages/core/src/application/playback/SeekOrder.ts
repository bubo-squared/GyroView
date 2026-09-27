import { isFlowing, type PlayerState } from '../../domain/playback/PlayerState';

/**
 * The seeks of a session in order: one that a listener's seek overtook while it was announced
 * stops there, and a seek made while another is announced resumes as that one would have.
 */
export class SeekOrder {
  private generation = 0;
  private isFromFlowing = false;

  /**
   * The newest seek, the one a scrub started before it must yield to.
   */
  public get current(): number {
    return this.generation;
  }

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
}
