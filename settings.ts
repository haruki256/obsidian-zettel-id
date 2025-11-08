import { App, PluginSettingTab, Setting } from 'obsidian';
import ZettelIdPlugin from './main';

/* =========================
   設定タブ
   ========================= */
export class ZettelSettingTab extends PluginSettingTab {
  plugin: ZettelIdPlugin;

  constructor(app: App, plugin: ZettelIdPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Zettel ID Property')
      .setDesc('Front matter property used to identify Zettel IDs.')
      .addText((text) =>
        text
          .setPlaceholder('zettel_id')
          .setValue(this.plugin.settings.zettelIdProperty)
          .onChange(async (value) => {
            this.plugin.settings.zettelIdProperty = value.trim() || 'zettel_id';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Default Sort Order')
      .setDesc('Sort Zettel identifiers in ascending or descending order by default.')
      .addDropdown((drop) =>
        drop
          .addOption('asc', 'Ascending')
          .addOption('desc', 'Descending')
          .setValue(this.plugin.settings.sortOrder)
          .onChange(async (value: 'asc' | 'desc') => {
            this.plugin.settings.sortOrder = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Highlight Current Note')
      .setDesc('Highlight and scroll to the currently open note in the view.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.focusCurrent).onChange(async (value) => {
          this.plugin.settings.focusCurrent = value;
          await this.plugin.saveSettings();
        }),
      );

    // テンプレートファイル
    new Setting(containerEl)
      .setName('Template file (optional)')
      .setDesc('例: Templates/zettel-template.md。指定すると新規作成時に適用されます。')
      .addText((text) =>
        text
          .setPlaceholder('Templates/zettel-template.md')
          .setValue(this.plugin.settings.templatePath)
          .onChange(async (value) => {
            this.plugin.settings.templatePath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // 新規ノート配置先
    new Setting(containerEl)
      .setName('New note root (optional)')
      .setDesc('例: Zettels。未指定なら従来のフォルダを使用します。')
      .addText((text) =>
        text
          .setPlaceholder('Zettels')
          .setValue(this.plugin.settings.newNoteRoot)
          .onChange(async (value) => {
            this.plugin.settings.newNoteRoot = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // no zettel id の除外パス（改行区切り）
    new Setting(containerEl)
      .setName('Exclude paths for "no zettel id"')
      .setDesc('改行区切りで入力。フォルダを指定すると配下すべて、".md" を付けるとそのファイルだけを除外します。例:\nZettels/Archive\nTemplates\nInbox/temporary-note.md')
      .addTextArea((ta) => {
        ta.setPlaceholder('Zettels/Archive\nTemplates\nInbox/temporary-note.md');
        ta.setValue((this.plugin.settings.noZettelExcludePaths ?? []).join('\n'));
        ta.onChange(async (value) => {
          const lines = value
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(Boolean);
          this.plugin.settings.noZettelExcludePaths = lines;
          await this.plugin.saveSettings();
        });
      });
  }
}
