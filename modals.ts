import { App, Modal } from 'obsidian';

/** 単純テキスト入力用モーダル */
export class TextInputModal extends Modal {
  private resolve!: (v: string | null) => void;
  private value: string;
  private placeholder?: string;
  private titleText: string;
  constructor(app: App, opts: { title: string; placeholder?: string; value?: string }) {
    super(app);
    this.titleText = opts.title;
    this.placeholder = opts.placeholder;
    this.value = opts.value ?? '';
  }
  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.titleText);
    const input = contentEl.createEl('input', {
      type: 'text',
      value: this.value,
      placeholder: this.placeholder ?? '',
    });
    input.addClass('modal-text-input');
    input.focus(); input.select();
    const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
    const ok = buttons.createEl('button', { text: 'OK' });
    const cancel = buttons.createEl('button', { text: 'Cancel' });
    const done = (val: string | null) => { this.close(); this.resolve(val); };
    ok.onclick = () => done(input.value.trim());
    cancel.onclick = () => done(null);
    input.onkeydown = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') done(input.value.trim());
      else if (ev.key === 'Escape') done(null);
    };
  }
  onClose(): void { this.contentEl.empty(); }
  wait(): Promise<string | null> { return new Promise((res) => (this.resolve = res)); }
}

/** 単純確認用モーダル（confirm 代替） */
export class ConfirmModal extends Modal {
  private resolve!: (ok: boolean) => void;
  private msg: string;
  constructor(app: App, msg: string) {
    super(app);
    this.msg = msg;
  }
  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText('確認');
    contentEl.createEl('p', { text: this.msg });

    const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
    const ok = buttons.createEl('button', { text: 'OK' });
    const cancel = buttons.createEl('button', { text: 'Cancel' });

    const done = (v: boolean) => { this.close(); this.resolve(v); };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
  }
  onClose(): void { this.contentEl.empty(); }
  wait(): Promise<boolean> { return new Promise((res) => (this.resolve = res)); }
}
