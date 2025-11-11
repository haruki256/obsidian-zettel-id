import {
	Plugin,
	TFile,
	TFolder,
  } from 'obsidian';
  
  import { ZettelIdPluginSettings, DEFAULT_SETTINGS, ZettelNode } from './types';
  import { ZettelIdView } from './view';
  import { ZettelSettingTab } from './settings';
  import {
	parseZettelId,
	compareZettelSegments,
	incrementSegment,
	isNumeric,
  } from './zettelUtils';
  
  /* =========================
	 プラグイン本体
	 ========================= */
  export default class ZettelIdPlugin extends Plugin {
	settings: ZettelIdPluginSettings;
	private cachedTree: { root: ZettelNode } | null = null;

	private _exclusionChecker: ((path: string) => boolean) | null = null;
	private _inclusionChecker: ((path: string) => boolean) | null = null;

	/** 設定に基づいて除外チェッカー関数を作成（またはキャッシュを返す） */
	private getExclusionChecker(): (path: string) => boolean {
	  if (this._exclusionChecker) {
		return this._exclusionChecker;
	  }
  
	  const raw = this.settings.noZettelExcludePaths ?? [];
	  const cleaned = raw
		.map(s => s.trim().replace(/\\/g, '/'))
		.filter(Boolean);
  
	  const excludeFileSet = new Set<string>();
	  const excludeFolderPrefixes: string[] = [];
  
	  for (const p of cleaned) {
		if (p.toLowerCase().endsWith('.md')) {
		  excludeFileSet.add(p.toLowerCase()); // 小文字で保存
		} else {
		  const pref = p.endsWith('/') ? p : (p.length ? `${p}/` : p);
		  if (pref) excludeFolderPrefixes.push(pref.toLowerCase()); // 小文字で保存
		}
	  }
  
	  const checker = (path: string): boolean => {
		const lowerPath = path.toLowerCase(); // 比較対象も小文字に
		if (excludeFileSet.has(lowerPath)) return true;
		for (const pref of excludeFolderPrefixes) {
		  if (lowerPath.startsWith(pref)) return true;
		}
		return false;
	  };
  
	  this._exclusionChecker = checker;
	  return checker;
	}

	/** 設定に基づいて包含チェッカー関数を作成（またはキャッシュを返す） */
	private getInclusionChecker(): (path: string) => boolean {
	  if (this._inclusionChecker) {
		return this._inclusionChecker;
	  }

	  const raw = this.settings.viewIncludePaths ?? [];
	  const cleaned = raw
		.map(s => s.trim().replace(/\\/g, '/'))
		.filter(Boolean);

	  // 空の場合は全て含める（常にtrueを返す）
	  if (cleaned.length === 0) {
		const alwaysTrue = () => true;
		this._inclusionChecker = alwaysTrue;
		return alwaysTrue;
	  }

	  const includeFolderPrefixes: string[] = [];

	  for (const p of cleaned) {
		const pref = p.endsWith('/') ? p : (p.length ? `${p}/` : p);
		if (pref) includeFolderPrefixes.push(pref.toLowerCase()); // 小文字で保存
	  }

	  const checker = (path: string): boolean => {
		const lowerPath = path.toLowerCase(); // 比較対象も小文字に
		for (const pref of includeFolderPrefixes) {
		  if (lowerPath.startsWith(pref)) return true;
		}
		return false;
	  };

	  this._inclusionChecker = checker;
	  return checker;
	}

	async onload() {
	  await this.loadSettings();
  
	  this.registerView(ZettelIdView.VIEW_TYPE, (leaf) => new ZettelIdView(leaf, this));
  
	  this.addCommand({
		id: 'open-zettel-view',
		name: 'Open Zettel ID view',
		callback: () => this.openZettelView(false),
	  });
	  this.addCommand({
		id: 'open-zettel-view-focus-current',
		name: 'Open Zettel ID view (focus current)',
		callback: () => {
		  this.settings.focusCurrent = true;
		  this.openZettelView(true);
		},
	  });
  
	  this.addSettingTab(new ZettelSettingTab(this.app, this));
	  this.registerEvent(this.app.metadataCache.on('resolved', () => { this.cachedTree = null; }));
	}
  
	onunload() {}
  
	async openZettelView(focus: boolean) {
	  const existing = this.app.workspace.getLeavesOfType(ZettelIdView.VIEW_TYPE);
	  if (existing.length > 0) {
		this.app.workspace.revealLeaf(existing[0]);
	  } else {
		const right = this.app.workspace.getRightLeaf(false);
		const leaf = right ?? this.app.workspace.getLeaf(true);
		await leaf.setViewState({ type: ZettelIdView.VIEW_TYPE, active: true });
	  }
	  if (focus) {
		this.settings.focusCurrent = true;
		await this.saveSettings();
	  }
	}
  
	async loadSettings() {
	  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	  this._exclusionChecker = null;
	  this._inclusionChecker = null;
	  // 後方互換：undefined の場合は空配列に
	  if (!Array.isArray(this.settings.noZettelExcludePaths)) {
		this.settings.noZettelExcludePaths = [];
	  }
	  if (!Array.isArray(this.settings.viewIncludePaths)) {
		this.settings.viewIncludePaths = [];
	  }
	   // ▼ 後方互換：展開状態フィールドが未定義ならデフォルト補完
	  if (typeof this.settings.zettelExpanded !== 'boolean')
		this.settings.zettelExpanded = true;
	  if (typeof this.settings.noZettelExpanded !== 'boolean')
		this.settings.noZettelExpanded = false;
	}
  
	async saveSettings() {
	  await this.saveData(this.settings);
	  this._exclusionChecker = null;
	  this._inclusionChecker = null;
	  this.cachedTree = null;
	  const viewLeaf = this.app.workspace.getLeavesOfType(ZettelIdView.VIEW_TYPE)[0];
	  if (viewLeaf && viewLeaf.view instanceof ZettelIdView) viewLeaf.view.refresh();
	}
  
	/** ビューから安全にキャッシュ無効化 */
	invalidateCache() { this.cachedTree = null; }
	/** 折りたたみIDの取得（未保存なら null） */
	getCollapsedIds(): string[] | null {
	  return this.settings.collapsedIds ?? null;
	}
	/** 折りたたみIDの保存 */
	async setCollapsedIds(ids: string[]) {
	  this.settings.collapsedIds = ids;
	  await this.saveSettings();
	}
	getZettelIdForFile(file: TFile): string | null {
	  const cache = this.app.metadataCache.getFileCache(file);
	  if (!cache || !cache.frontmatter) return null;
	  const value = cache.frontmatter[this.settings.zettelIdProperty];
	  if (typeof value === 'string') return value.trim();
	  return null;
	}
  
	buildZettelTree(): { root: ZettelNode } {
	  if (this.cachedTree) return this.cachedTree;

	  const root: ZettelNode = { id: '', segments: [], children: new Map(), files: [] };
	  const files = this.app.vault.getMarkdownFiles();

	  // チェッカーを取得
	  const isExcluded = this.getExclusionChecker();
	  const isIncluded = this.getInclusionChecker();

	  for (const file of files) {
		// 包含チェック（空の場合は全て含める）
		if (!isIncluded(file.path)) continue;
		// 除外チェック
		if (isExcluded(file.path)) continue;

		const id = this.getZettelIdForFile(file);
		if (!id) continue;
		const segs = parseZettelId(id);
  
		let parent = root;
		const acc: string[] = [];
		segs.forEach((seg, idx) => {
		  acc.push(seg);
		  const curId = acc.join('.');
		  if (!parent.children.has(curId)) {
			parent.children.set(curId, {
			  id: curId,
			  segments: acc.slice(),
			  children: new Map(),
			  files: [],
			});
		  }
		  parent = parent.children.get(curId)!;
		  if (idx === segs.length - 1) parent.files.push(file); // duplicate-friendly
		});
	  }
  
	  const sortRecursively = (n: ZettelNode) => {
		const entries = Array.from(n.children.entries());
		entries.sort((a, b) => {
		  const cmp = compareZettelSegments(parseZettelId(a[0]), parseZettelId(b[0]));
		  return this.settings.sortOrder === 'asc' ? cmp : -cmp;
		});
		n.children = new Map(entries);
		n.children.forEach(sortRecursively);
	  };
	  sortRecursively(root);
  
	  this.cachedTree = { root };
	  return this.cachedTree;
	}
  
	getZettelNodes() { return { root: this.buildZettelTree().root }; }
  
	/** 除外パス対応版：zettel_id 未設定ファイル一覧 */
	getFilesWithoutZettel(): TFile[] {
	  const files = this.app.vault.getMarkdownFiles();

	  // チェッカーを取得し、古いロジックを削除
	  const isExcluded = this.getExclusionChecker();
	  const isIncluded = this.getInclusionChecker();

	  const out: TFile[] = [];
	  for (const f of files) {
		if (!isIncluded(f.path)) continue; // 包含チェック
		if (isExcluded(f.path)) continue; // 除外
		const id = this.getZettelIdForFile(f);
		if (!id) out.push(f);
	  }
	  out.sort((a, b) => a.basename.localeCompare(b.basename));
	  return out;
	}
  
	/* =========================
	   新規作成：テンプレート・配置先対応
	   ========================= */
  
	/** テンプレート本文を読み込み（なければ null） */
	private async readTemplateFile(): Promise<string | null> {
	  const p = this.settings.templatePath?.trim();
	  if (!p) return null;
	  const abs = this.app.vault.getAbstractFileByPath(p);
	  if (!(abs instanceof TFile)) return null;
	  try {
		return await this.app.vault.read(abs);
	  } catch { return null; }
	}
  
	/** frontmatter を行単位で安全に上書きマージして zettel_id を確実に入れる */
	private applyTemplateWithZettelId(raw: string | null, zettelProp: string, zettelId: string): string {
	  // 値は常に YAML のダブルクォート付き文字列にする
	  const escaped = zettelId.replace(/"/g, '\\"');
	  const propLine = `${zettelProp}: "${escaped}"`;
  
	  // テンプレ無し
	  if (!raw || raw.trim() === '') {
		return `---\n${propLine}\n---\n\n`;
	  }
  
	  // frontmatter ブロック検出
	  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	  if (!m) {
		// そもそも frontmatter がないテンプレ → 付与
		return `---\n${propLine}\n---\n${raw}`;
	  }
  
	  // 行単位で安全に書き換える（改行は \n に正規化）
	  const fm = m[1]?.replace(/\r\n/g, '\n') ?? '';
	  const body = (m[2] ?? '').replace(/\r\n/g, '\n');
  
	  const lines = fm.split('\n');
	  const propRe = new RegExp(`^\\s*${zettelProp}\\s*:\\s*(.*)$`);
	  let found = false;
  
	  for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (propRe.test(line)) {
		  // 値を常にダブルクォート付き文字列に置換
		  lines[i] = propLine;
		  found = true;
		  break;
		}
	  }
  
	  if (!found) {
		// 既存になければ末尾に追加
		lines.push(propLine);
	  }
  
	  const fmOut = lines.join('\n');
  
	  // frontmatter と本文の間に 1 行は空ける（本文が空なら最終的に 1 行で終える）
	  const sep = body.length > 0 && !body.startsWith('\n') ? '\n' : '';
	  return `---\n${fmOut}\n---\n${sep}${body}`;
	}
  
	/** 新規ノートの配置先フォルダを決定（存在しなければ作成） */
	private async resolveNewNoteFolder(fallbackFolder: string): Promise<string> {
	  const cfg = this.settings.newNoteRoot?.trim();
	  if (!cfg) return fallbackFolder;
	  const abs = this.app.vault.getAbstractFileByPath(cfg);
	  if (abs && abs instanceof TFolder) return cfg;
	  // 無ければ作る（階層ごと）
	  const parts = cfg.split('/').filter(Boolean);
	  let cur = '';
	  for (const part of parts) {
		cur = cur ? `${cur}/${part}` : part;
		const node = this.app.vault.getAbstractFileByPath(cur);
		if (!node) {
		  // eslint-disable-next-line no-await-in-loop
		  await this.app.vault.createFolder(cur);
		}
	  }
	  return cfg;
	}
  
	/** 指定IDでファイルを（テンプレ適用で）作成して開く */
	async createAndOpenFileForId(zettelId: string, baseName?: string, preferFolder?: string) {
	  const zprop = this.settings.zettelIdProperty;
	  const template = await this.readTemplateFile();
	  const content = this.applyTemplateWithZettelId(template, zprop, zettelId);
  
	  const folder = await this.resolveNewNoteFolder(preferFolder || this.app.vault.getRoot().path);
	  const safeBase = (baseName ?? `zettel ${zettelId}`).replace(/[\\/:*?"<>|]/g, '-');
	  let fileName = `${safeBase}.md`;
	  let counter = 1;
	  while (await this.app.vault.adapter.exists(`${folder}/${fileName}`)) {
		fileName = `${safeBase} (${counter++}).md`;
	  }
	  const nf = await this.app.vault.create(`${folder}/${fileName}`, content);
	  await this.app.workspace.getLeaf().openFile(nf);
	  this.invalidateCache();
	  return nf;
	}
  
	/** 子を「数↔英」交互で自動採番。既存子IDはスキップ。テンプレ＆配置も対応 */
	async createNextChildZettel(node: ZettelNode) {
	  const parentId = node.id;
	  const last = node.segments[node.segments.length - 1] ?? '';
	  const startAlpha = isNumeric(last);          // 数字の次は英字、英字の次は数字
	  let cand = startAlpha ? 'a' : '1';
  
	  const existing = new Set<string>(Array.from(node.children.keys()));
  
	  // 既定のフォルダ: 設定 > newNoteRoot があれば優先、無ければ親ファイルのフォルダ or ルート
	  const baseFolder = await this.resolveNewNoteFolder(
		node.files[0]?.parent?.path ?? this.app.vault.getRoot().path
	  );
  
	  while (true) {
		const newId = parentId ? `${parentId}.${cand}` : cand;
		if (!existing.has(newId)) {
		  await this.createAndOpenFileForId(newId, `zettel ${newId}`, baseFolder);
		  return;
		}
		cand = incrementSegment(cand); // 型は維持
	  }
	}
  
	/* =========================
	   DnD のためのユーティリティ
	   ========================= */
  
	/** 既存全ID集合を取得 */
	private collectExistingIds(root: ZettelNode): Set<string> {
	  const s = new Set<string>();
	  const dfs = (n: ZettelNode) => {
		n.children.forEach((c) => { s.add(c.id); dfs(c); });
	  };
	  dfs(root);
	  return s;
	}
  
	/** サブツリーの全ID一覧（親を含む） */
	public listSubtreeIds(node: ZettelNode): string[] {
	  const out: string[] = [];
	  const dfs = (n: ZettelNode) => {
		out.push(n.id);
		n.children.forEach(dfs);
	  };
	  dfs(node);
	  return out;
	}
  
	/** targetParentId の直下に sourceNode をぶら下げるための ID マッピング（重複回避しつつ） */
	computeIdRemap(root: ZettelNode, sourceNode: ZettelNode, targetParentId: string): Map<string,string> | null {
	  const existing = this.collectExistingIds(root);
	  const sourceIds = this.listSubtreeIds(sourceNode); // 衝突チェック（移動元サブツリー）に必要
  
	  const parentSegs = parseZettelId(targetParentId);
	  const last = parentSegs[parentSegs.length - 1] ?? '';
	  let cand = isNumeric(last) ? 'a' : '1';
  
	  for (let guard=0; guard<500; guard++) {
		const newRootId = targetParentId ? `${targetParentId}.${cand}` : cand;
		const remap = new Map<string,string>();
		let conflict = false;
  
		// 再帰的にIDを再採番するロジック
		const buildRemapRecursive = (node: ZettelNode, newParentId: string) => {
		  // 1. 処理対象のノードの子を、ソート順（ビューの表示順）で取得
		  const children = Array.from(node.children.values());
		  // (ソート順は buildZettelTree ですでに確定しているため、 .values() でOK)
  
		  // 2. 新しい親ID (newParentId) の型に基づいて、子の採番を開始 (A or 1)
		  const parentLastSeg = parseZettelId(newParentId).pop() ?? '';
		  const startAlpha = isNumeric(parentLastSeg);
		  let nextSeg = startAlpha ? 'a' : '1';
  
		  for (const childNode of children) {
			let newChildId: string;
			
			// 3. 衝突しないセグメントが見つかるまでループ
			while (true) {
			  newChildId = newParentId ? `${newParentId}.${nextSeg}` : nextSeg;
  
			  // 衝突チェック：
			  // 1. 移動元サブツリー「以外」の既存IDと衝突していないか？
			  // (sourceIds に含まれるIDは、どうせ上書きされるので衝突とみなさない)
			  if (!sourceIds.includes(newChildId) && existing.has(newChildId)) {
				// 衝突した（例: 1.b.a が既に存在した）
				nextSeg = incrementSegment(nextSeg); // セグメントをインクリメント (a -> b)
			  } else {
				// 衝突なし。このIDで確定
				break;
			  }
			}
			
			// 4. 確定したマッピングを保存
			remap.set(childNode.id, newChildId);
			
			// 5. 孫ノードに対しても再帰的に実行
			if (childNode.children.size > 0) {
			  buildRemapRecursive(childNode, newChildId);
			}
			
			// 6. 次の「兄弟」のためのセグメントを用意
			nextSeg = incrementSegment(nextSeg);
		  }
		};
  
		// ------------------------------------
		// ルートノードの衝突チェック
		if (!sourceIds.includes(newRootId) && existing.has(newRootId)) {
		  conflict = true; // ルートIDが既に使われていた
		} else {
		  // ルートIDはOK
		  remap.set(sourceNode.id, newRootId);
		  // このルートIDを親として、子の再採番を開始
		  buildRemapRecursive(sourceNode, newRootId);
		}
		// ------------------------------------
  
		if (!conflict) return remap; // 衝突なくマッピングが完了した
		
		cand = incrementSegment(cand); // 衝突したのでルートID候補を (1 -> 2) にして再試行
	  }
	  return null; // 500回試行してもダメだった
	}

	/** 指定された新しいルートIDでサブツリーのIDマッピングを作成（重複回避しつつ） */
	computeIdRemapWithSpecificId(root: ZettelNode, sourceNode: ZettelNode, newRootId: string): Map<string,string> | null {
		const existing = this.collectExistingIds(root);
		const sourceIds = this.listSubtreeIds(sourceNode);

		// 新しいIDが既存と衝突しないかチェック（移動元サブツリー以外）
		if (!sourceIds.includes(newRootId) && existing.has(newRootId)) {
			return null; // 衝突あり
		}

		const remap = new Map<string,string>();

		// 再帰的にIDを再採番するロジック
		const buildRemapRecursive = (node: ZettelNode, newParentId: string) => {
			// 1. 処理対象のノードの子を、ソート順（ビューの表示順）で取得
			const children = Array.from(node.children.values());

			// 2. 新しい親ID (newParentId) の型に基づいて、子の採番を開始 (A or 1)
			const parentLastSeg = parseZettelId(newParentId).pop() ?? '';
			const startAlpha = isNumeric(parentLastSeg);
			let nextSeg = startAlpha ? 'a' : '1';

			for (const childNode of children) {
				let newChildId: string;
				
				// 3. 衝突しないセグメントが見つかるまでループ
				while (true) {
					newChildId = newParentId ? `${newParentId}.${nextSeg}` : nextSeg;

					// 衝突チェック：
					// 移動元サブツリー「以外」の既存IDと衝突していないか？
					if (!sourceIds.includes(newChildId) && existing.has(newChildId)) {
						// 衝突した
						nextSeg = incrementSegment(nextSeg);
					} else {
						// 衝突なし。このIDで確定
						break;
					}
				}
				
				// 4. 確定したマッピングを保存
				remap.set(childNode.id, newChildId);
				
				// 5. 孫ノードに対しても再帰的に実行
				if (childNode.children.size > 0) {
					buildRemapRecursive(childNode, newChildId);
				}
				
				// 6. 次の「兄弟」のためのセグメントを用意
				nextSeg = incrementSegment(nextSeg);
			}
		};

		// ルートノードのマッピングを設定
		remap.set(sourceNode.id, newRootId);
		// このルートIDを親として、子の再採番を開始
		buildRemapRecursive(sourceNode, newRootId);

		return remap;
	}
  
	/** マッピングに基づいて frontmatter の zettel_id を一括更新 */
	async applyIdRemap(remap: Map<string,string>, zprop: string, treeNodeById: Map<string,ZettelNode>) {
	  const entries: Array<{file: TFile, from: string, to: string}> = [];
	  for (const [fromId, toId] of remap) {
		const node = treeNodeById.get(fromId);
		if (!node) continue;
		for (const f of (node.files ?? [])) {
		  entries.push({ file: f, from: fromId, to: toId });
		}
	  }
	  for (const e of entries) {
		// eslint-disable-next-line no-await-in-loop
		await this.app.fileManager.processFrontMatter(e.file, (fm) => { fm[zprop] = e.to; });
	  }
	}
  
	/** id → node のインデックス */
	buildIdIndex(root: ZettelNode): Map<string,ZettelNode> {
	  const map = new Map<string,ZettelNode>();
	  const dfs = (n: ZettelNode) => {
		n.children.forEach((c) => { map.set(c.id, c); dfs(c); });
	  };
	  dfs(root);
	  return map;
	}
  }
