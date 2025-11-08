import { TFile } from 'obsidian';

/* =========================
   設定・型
   ========================= */
export interface ZettelIdPluginSettings {
  zettelIdProperty: string;
  sortOrder: 'asc' | 'desc';
  focusCurrent: boolean;

  /** 新規作成時のテンプレートパス（例: "Templates/zettel-template.md"） */
  templatePath: string;

  /** 新規作成時の配置先ルート（例: "Zettels"） */
  newNoteRoot: string;

  /** 折りたたみ状態の保存（各ノードIDの配列）。null/未設定なら「未保存」。 */
  collapsedIds?: string[] | null;

  /** 追加：no zettel id の除外パス（フォルダ or md ファイル）。改行区切り */
  noZettelExcludePaths: string[];
   /** ▼ 新規追加：セクション展開状態の保存用 */
  zettelExpanded: boolean;      // zettel id セクションの開閉
  noZettelExpanded: boolean;    // no zettel id セクションの開閉
}

export const DEFAULT_SETTINGS: ZettelIdPluginSettings = {
  zettelIdProperty: 'zettel_id',
  sortOrder: 'asc',
  focusCurrent: true,
  templatePath: '',
  newNoteRoot: '',
  collapsedIds: null,
  noZettelExcludePaths: [],
  zettelExpanded: true,
  noZettelExpanded: false,
};

export interface ZettelNode {
  id: string;
  segments: string[];
  files: TFile[];                   // duplicate ID allowed
  children: Map<string, ZettelNode>;
}
