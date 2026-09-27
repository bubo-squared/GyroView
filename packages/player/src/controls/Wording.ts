import { isGyroViewErrorCode, type GyroViewErrorCode } from '@gyroview/core';

import {
  DEFAULT_MESSAGES,
  isChoiceTable,
  isLabelName,
  messagesWith,
  type GyroViewMessages,
  type LabelName,
} from './messages';

const LABEL = 'data-label';
const TEXT = 'data-text';
const CHOICES = 'data-choices';
const ERROR = 'data-error';
const SELECTORS = {
  label: '[data-label]',
  text: '[data-text]',
  choices: '[data-choices]',
  error: '[data-error]',
} as const;

/**
 * The words the element speaks, and where they go. The markup holds no words: each element that
 * says one names it in a data attribute, which `write` fills in, at first and after every change
 * of words.
 * - `data-label`: the label for its `aria-label`;
 * - `data-text`: the label for its text;
 * - `data-choices` on a menu: the table its items' `data-choice` are read from;
 * - `data-error`: the visitor's words for that failure code.
 */
export class Wording {
  private words = DEFAULT_MESSAGES;

  public get current(): GyroViewMessages {
    return this.words;
  }

  /**
   * The defaults with the page's own words in their place; `write` shows them.
   */
  public replace(overrides: unknown): void {
    this.words = messagesWith(overrides);
  }

  /**
   * Calls `element` by the label `name` names, now and after every change of words.
   */
  public label(element: Element, name: LabelName): void {
    element.setAttribute(LABEL, name);
    element.setAttribute('aria-label', this.words.labels[name]);
  }

  /**
   * Tells the visitor in `element` that the recording failed with `code`.
   */
  public showError(element: Element, code: GyroViewErrorCode): void {
    element.setAttribute(ERROR, code);
    element.textContent = this.words.errors[code];
  }

  /**
   * Fills in every word below `root` that its markup names.
   */
  public write(root: ParentNode): void {
    for (const element of root.querySelectorAll(SELECTORS.label)) this.writeLabel(element);
    for (const element of root.querySelectorAll(SELECTORS.text)) this.writeText(element);
    for (const menu of root.querySelectorAll(SELECTORS.choices)) this.writeChoices(menu);
    for (const element of root.querySelectorAll(SELECTORS.error)) this.writeError(element);
  }

  private writeLabel(element: Element): void {
    const name = element.getAttribute(LABEL);
    if (isLabelName(name)) element.setAttribute('aria-label', this.words.labels[name]);
  }

  private writeText(element: Element): void {
    const name = element.getAttribute(TEXT);
    if (isLabelName(name)) element.textContent = this.words.labels[name];
  }

  private writeChoices(menu: Element): void {
    const name = menu.getAttribute(CHOICES);
    if (!isChoiceTable(name)) return;
    const table: Readonly<Record<string, string>> = this.words[name];
    for (const item of menu.querySelectorAll<HTMLElement>('[data-choice]')) {
      item.textContent = table[item.dataset['choice'] ?? ''] ?? '';
    }
  }

  private writeError(element: Element): void {
    const code = element.getAttribute(ERROR);
    if (isGyroViewErrorCode(code)) element.textContent = this.words.errors[code];
  }
}
