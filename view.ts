import {
	WorkspaceLeaf,
	ItemView,
	setIcon,
	Menu,
	Notice,
	MarkdownView,
	TFile,
  } from 'obsidian';
  import ZettelIdPlugin from './main'; // プラグイン本体
  import { ZettelNode } from './types';
  import { parseZettelId } from './zettelUtils';
  import { TextInputModal, ConfirmModal } from './modals';
  
  /* =========================
	 ビュー
	 ========================= */
  export class ZettelIdView extends ItemView {
	static VIEW_TYPE = 'zettel-id-view';
	plugin: ZettelIdPlugin;
	collapsed: Set<string> = new Set();
	private contentContainer!: HTMLElement;
  
	// ▼ 選択管理
	private selectedPaths: Set<string> = new Set();   // 選択されている TFile.path 集合
	private lastSelectedIndex: number | null = null;  // 範囲選択アンカー（rowEntries の index）
	private rowEntries: Array<{ index: number; file: TFile; nodeId: string }> = [];
	// ▲
  
	constructor(leaf: WorkspaceLeaf, plugin: ZettelIdPlugin) {
	  super(leaf);
	  this.plugin = plugin;
	}
  
	getViewType() { return ZettelIdView.VIEW_TYPE; }
	getDisplayText() { return 'Zettel IDs'; }
	getIcon() { return 'hash'; }
  
	private nodesWithChildren(root: ZettelNode): string[] {
	  const out: string[] = [];
	  const dfs = (n: ZettelNode) => {
		n.children.forEach((child) => {
		  if (child.children.size > 0) out.push(child.id);
		  dfs(child);
		});
	  };
	  dfs(root);
	  return out;
	}
	private expandPathTo(id: string) {
	  if (!id) return;
	  const parts = parseZettelId(id);
	  if (parts.length === 0) return;
	  let acc: string[] = [];
	  for (let i = 0; i < parts.length - 1; i++) {
		acc.push(parts[i]);
		this.collapsed.delete(acc.join('.'));
	  }
	}
  
	// ▼ 選択ユーティリティ
	private clearSelection() {
	  this.selectedPaths.clear();
	  this.lastSelectedIndex = null;
	}
	private setAnchor(index: number) {
	  this.lastSelectedIndex = index;
	}
	private selectSingle(index: number) {
	  const entry = this.rowEntries[index];
	  if (!entry) return;
	  this.selectedPaths.clear();
	  this.selectedPaths.add(entry.file.path);
	  this.setAnchor(index);
	}
	private selectRange(toIndex: number) {
	  if (this.lastSelectedIndex === null) {
		this.selectSingle(toIndex);
		return;
	  }
	  const [a, b] = [this.lastSelectedIndex, toIndex].sort((x, y) => x - y);
	  this.selectedPaths.clear();
	  for (let i = a; i <= b; i++) {
		const e = this.rowEntries[i];
		if (e?.file) this.selectedPaths.add(e.file.path);
	  }
	}
	// ▲
  
	// ▼ 削除対象収集（配下含む/含まない）
	private collectDeleteTargets(includeSubtree: boolean, baseFiles: TFile[]): TFile[] {
	  if (!includeSubtree) {
		return Array.from(new Set(baseFiles));
	  }
	  const tree = this.plugin.buildZettelTree();
	  const root = tree.root;
	  const idIndex = this.plugin.buildIdIndex(root);
  
	  const fileSet = new Set<TFile>();
	  for (const f of baseFiles) {
		const id = this.plugin.getZettelIdForFile(f);
		if (!id) { fileSet.add(f); continue; }
		const node = idIndex.get(id);
		if (!node) { fileSet.add(f); continue; }
		const ids = this.plugin.listSubtreeIds(node);
		for (const subId of ids) {
		  const subNode = idIndex.get(subId);
		  if (!subNode) continue;
		  for (const sf of subNode.files ?? []) fileSet.add(sf);
		}
	  }
	  return Array.from(fileSet);
	}
	// ▲
  
	async refresh() {
	  if (!this.contentContainer) return;
	  this.contentContainer.empty();
  
	  // Header
	  const header = this.contentContainer.createDiv({ cls: 'zettel-view-container-header' });
	  const controls = header.createDiv({ cls: 'zettel-view-controls' });
  
	  // 新規ノート（ルートの空き整数）
	  const newRootBtn = controls.createEl('button', { attr: { 'aria-label': 'New root note' }, cls: 'zi-icon-btn' });
	  setIcon(newRootBtn, 'plus');
	  newRootBtn.onclick = async () => {
		const { root } = this.plugin.getZettelNodes();
		const existing = new Set(
		  Array.from(root.children.keys())
			.filter(id => parseZettelId(id).length === 1)
		);
		let n = 1;
		while (existing.has(String(n))) n++;
		const newId = String(n);
  
		const prefer = this.plugin.settings.newNoteRoot || this.app.vault.getRoot().path;
		await this.plugin.createAndOpenFileForId(newId, `zettel ${newId}`, prefer);
		this.clearSelection();
		this.refresh();
	  };
  
	  // Toggle-all
	  const toggleAllBtn = controls.createEl('button', { attr: { 'aria-label': 'Toggle all' }, cls: 'zi-icon-btn' });
	  setIcon(toggleAllBtn, 'chevrons-down-up');
	  toggleAllBtn.onclick = () => {
		const root = this.plugin.getZettelNodes().root;
		const targets = this.nodesWithChildren(root);
		const allCollapsed = targets.every(id => this.collapsed.has(id));
		if (allCollapsed) {
		  this.collapsed.clear();
		} else {
		  this.collapsed.clear();
		  for (const id of targets) this.collapsed.add(id);
		}
		// 状態を保存
		this.plugin.setCollapsedIds(Array.from(this.collapsed));
		this.refresh();
	  };
  
	  // Focus toggle
	  const focusBtn = controls.createEl('button', { attr: { 'aria-label': 'Focus current' }, cls: 'zi-icon-btn' });
	  setIcon(focusBtn, 'target');
	  if (this.plugin.settings.focusCurrent) focusBtn.classList.add('is-active');
	  focusBtn.onclick = () => {
		this.plugin.settings.focusCurrent = !this.plugin.settings.focusCurrent;
		focusBtn.classList.toggle('is-active', this.plugin.settings.focusCurrent);
		this.plugin.saveSettings();
		this.refresh();
	  };
  
	  // Sort toggle
	  const sortBtn = controls.createEl('button', { attr: { 'aria-label': 'Toggle sort' }, cls: 'zi-icon-btn' });
	  setIcon(sortBtn, this.plugin.settings.sortOrder === 'asc' ? 'chevron-down' : 'chevron-up');
	  sortBtn.onclick = () => {
		this.plugin.settings.sortOrder = this.plugin.settings.sortOrder === 'asc' ? 'desc' : 'asc';
		setIcon(sortBtn, this.plugin.settings.sortOrder === 'asc' ? 'chevron-down' : 'chevron-up');
		this.plugin.saveSettings();
		this.refresh();
	  };
  
	  // Lists
	  const listsContainer = this.contentContainer.createDiv({ cls: 'zettel-view-lists' });
  
	  // zettel id section
	  const zSection = listsContainer.createDiv({ cls: 'zettel-section' });
	  const zHeader = zSection.createEl('h2', { text: 'zettel id' });
	  const toggleZettel = zHeader.createSpan({ text: ' (Toggle)' });
	  toggleZettel.classList.add('clickable', 'muted');
	  const zList = zSection.createDiv({ cls: ['zettel-list', 'zi-list'] });
	  // ▼ 設定から展開状態を復元
	  zList.toggleClass('is-hidden', !this.plugin.settings.zettelExpanded);
	  toggleZettel.onclick = async () => {
		  this.plugin.settings.zettelExpanded = !this.plugin.settings.zettelExpanded;
		  zList.toggleClass('is-hidden', !this.plugin.settings.zettelExpanded);
		  await this.plugin.saveSettings();
	  };
  
	  // no zettel id section
	  const nzSection = listsContainer.createDiv({ cls: 'zettel-section' });
	  const nzHeader = nzSection.createEl('h2', { text: 'no zettel id' });
	  const toggleNZ = nzHeader.createSpan({ text: ' (Toggle)' });
	  toggleNZ.classList.add('clickable', 'muted');
	  const nzList = nzSection.createDiv({ cls: ['no-zettel-list', 'zi-list'] });
	  // ▼ 設定から展開状態を復元・保存
	  nzList.toggleClass('is-hidden', !this.plugin.settings.noZettelExpanded);
	  toggleNZ.onclick = async () => {
		  this.plugin.settings.noZettelExpanded = !this.plugin.settings.noZettelExpanded;
		  nzList.toggleClass('is-hidden', !this.plugin.settings.noZettelExpanded);
		  await this.plugin.saveSettings();
	  };
  
	  // Render
	  this.renderZettelList(zList);
	  this.renderNoZettelList(nzList);
	}
  
	async onOpen() {
		this.contentEl.empty();
		this.contentContainer = this.contentEl.createDiv({ cls: 'zettel-view-container' });
	
		// 1. 状態のロード（なければデフォルト作成＋保存）
		const saved = this.plugin.getCollapsedIds();
		if (saved && saved.length) {
		  this.collapsed = new Set(saved);
		} else {
		  const { root } = this.plugin.getZettelNodes();
		  this.collapsed = new Set(this.nodesWithChildren(root));
		  await this.plugin.setCollapsedIds(Array.from(this.collapsed));
		}
	
		this.registerEvent(this.app.metadataCache.on('changed', () => this.refresh()));
	
		// 2. 「リーフがアクティブになった時」のハンドラを定義
		const leafChangeHandler = async (leaf: WorkspaceLeaf | null) => {
		  let stateChanged = false; // 状態が変更されたか
		  
		  const view = leaf?.view;
		  const isMarkdown = view instanceof MarkdownView;
		  // 'view' を直接 'instanceof' でチェックすることで、
		  // 'isMarkdown' が true の場合に 'view.file' へのアクセスが型安全になります。
		  const file: TFile | null = isMarkdown ? view.file : null;
		  
		  if (this.plugin.settings.focusCurrent && file) {
			const id = this.plugin.getZettelIdForFile(file);
			
			if (id) {
			  const parts = parseZettelId(id);
			  let acc: string[] = [];
			  for (let i = 0; i < parts.length - 1; i++) {
				acc.push(parts[i]);
				const currentId = acc.join('.');
				if (this.collapsed.has(currentId)) {
				  this.collapsed.delete(currentId);
				  stateChanged = true; 
				}
			  }
			}
		  }
	
		  if (stateChanged) {
			await this.plugin.setCollapsedIds(Array.from(this.collapsed));
		  }
	
		  if (isMarkdown) {
			await this.refresh();
		  }
		};
	
		// 3. イベントハンドラを登録
		this.registerEvent(this.app.workspace.on('active-leaf-change', leafChangeHandler));
		
		// 4. 初回フォーカス（onOpen時）
		let stateChangedOnOpen = false;
		if (this.plugin.settings.focusCurrent) {
		  const activeLeaf = this.app.workspace.activeLeaf;
	
		  const view = activeLeaf?.view;
		  const isMarkdown = view instanceof MarkdownView;
		  const file: TFile | null = isMarkdown ? view.file : null;
		  
		  const id = file ? this.plugin.getZettelIdForFile(file) : null;
		  
		  if (id) {
			const parts = parseZettelId(id);
			let acc: string[] = [];
			for (let i = 0; i < parts.length - 1; i++) {
			  acc.push(parts[i]);
			  const currentId = acc.join('.');
			  if (this.collapsed.has(currentId)) {
				this.collapsed.delete(currentId);
				stateChangedOnOpen = true; 
			  }
			}
		  }
		}
		if (stateChangedOnOpen) {
		  await this.plugin.setCollapsedIds(Array.from(this.collapsed));
		}
		
		// 5. 最後に「初回描画」を必ず実行
		await this.refresh();
	  }
  
	private renderZettelList(container: HTMLElement) {
	  const root = this.plugin.buildZettelTree().root;
	  const currentFile = this.app.workspace.getActiveFile();
	  const currentId = currentFile ? this.plugin.getZettelIdForFile(currentFile) : null;
  
	  // 描画時の行テーブルを初期化
	  this.rowEntries = [];
	  let rowCounter = 0;
  
	  const renderNode = (node: ZettelNode, depth: number) => {
		node.children.forEach((child) => {
		  const isCollapsed = this.collapsed.has(child.id);
		  const files = child.files ?? [];
		  const rowCount = Math.max(1, files.length);
  
		  for (let i = 0; i < rowCount; i++) {
			const file = files[i];
			const row = container.createDiv({ cls: ['zettel-row', 'zi-row'] });
			row.setAttr('data-depth', String(depth));
  
			// 行インデックス付与（ファイル行のみ選択対象）
			let rowIndex: number | null = null;
			if (file) {
			  rowIndex = rowCounter++;
			  this.rowEntries.push({ index: rowIndex, file, nodeId: child.id });
			  row.dataset.rowindex = String(rowIndex);
			  if (this.selectedPaths.has(file.path)) {
				row.classList.add('is-selected');
			  }
			}
  
			// toggle (first row only)
			if (i === 0) {
			  const toggle = row.createSpan({ cls: ['zettel-toggle', 'zi-toggle'] });
			  toggle.setAttr('data-has-children', String(child.children.size > 0));
			  toggle.setAttr('data-collapsed', String(isCollapsed));
			  if (child.children.size > 0) {
				toggle.classList.add('clickable');
				toggle.onclick = async (ev) => {
				  ev.stopPropagation();
				  if (this.collapsed.has(child.id)) this.collapsed.delete(child.id);
				  else this.collapsed.add(child.id);
				  // 状態を保存
				  await this.plugin.setCollapsedIds(Array.from(this.collapsed));
				  this.refresh();
				};
			  }
  
			  // DnD: このノード（1行目）のみドラッグ＆ドロップ可能
			  row.setAttr('draggable', 'true');
  
			  row.addEventListener('dragstart', (ev) => {
				ev.dataTransfer?.setData('text/plain', child.id);
				row.classList.add('dragging');
			  });
			  row.addEventListener('dragend', () => {
				row.classList.remove('dragging');
			  });
			  row.addEventListener('dragover', (ev) => {
				ev.preventDefault();
				row.classList.add('dragover');
			  });
			  row.addEventListener('dragleave', () => {
				row.classList.remove('dragover');
			  });
			  row.addEventListener('drop', async (ev) => {
				ev.preventDefault();
				row.classList.remove('dragover');
				const sourceId = ev.dataTransfer?.getData('text/plain');
				const targetParentId = child.id; // この行ノードを「親」として受け取る
				if (!sourceId || sourceId === targetParentId) return;
  
				const tree = this.plugin.buildZettelTree();
				const r = tree.root;
				const idIndex = this.plugin.buildIdIndex(r);
				const sourceNode = idIndex.get(sourceId);
				const zprop = this.plugin.settings.zettelIdProperty;
  
				if (!sourceNode) return;
  
				// 自己や子孫へは移動不可
				if (sourceId === targetParentId || targetParentId.startsWith(sourceId + '.')) {
				  new Notice('自分自身や子孫の下には移動できません', 3000);
				  return;
				}
  
				const remap = this.plugin.computeIdRemap(r, sourceNode, targetParentId);
				if (!remap) { new Notice('移動先で重複回避ができませんでした', 3000); return; }
  
				try {
				  await this.plugin.applyIdRemap(remap, zprop, idIndex);
				  this.plugin.invalidateCache();
				  await new Promise((r)=>setTimeout(r, 200));
				  this.refresh();
				  new Notice('Zettel ID を更新しました');
				} catch (e) {
				  console.error(e);
				  new Notice('移動に失敗しました', 4000);
				}
			  });
			} else {
			  const spacer = row.createSpan({ cls: ['zi-toggle', 'zi-toggle-spacer'] });
			  spacer.setAttr('data-has-children', 'false');
			  spacer.setAttr('data-collapsed', 'false');
			}
  
			// id（クリックで開く／なければ新規作成）＋ 選択/タブ対応
			const idSpan = row.createSpan({ cls: ['zettel-id', 'zi-id', 'clickable'] });
			idSpan.textContent = `${child.id}: `;
			idSpan.onclick = async (ev) => {
			  ev.stopPropagation();
  
			  // Shift 範囲選択 / Ctrl(⌘) 新規タブ
			  if (file) {
				const idx = rowIndex ?? parseInt(row.dataset.rowindex || "-1", 10);
				if (ev.shiftKey && idx >= 0) {
				  this.selectRange(idx);
				  this.refresh();
				  return;
				}
				if (ev.ctrlKey || ev.metaKey) {
				  const fs = child.files ?? [];
				  if (fs.length > 0) {
					const leaf = this.app.workspace.getLeaf(true);
					await leaf.openFile(fs[0]);
				  } else {
					const prefer = this.plugin.settings.newNoteRoot || this.app.vault.getRoot().path;
					const nf = await this.plugin.createAndOpenFileForId(child.id, `zettel ${child.id}`, prefer);
					const leaf = this.app.workspace.getLeaf(true);
					await leaf.openFile(nf);
				  }
				  return;
				}
				// 通常クリック：単一選択＋開く
				if (idx >= 0) this.selectSingle(idx);
			  }
  
			  const fs = child.files ?? [];
			  if (fs.length > 0) {
				await this.app.workspace.getLeaf().openFile(fs[0]);
			  } else {
				const prefer = this.plugin.settings.newNoteRoot || this.app.vault.getRoot().path;
				await this.plugin.createAndOpenFileForId(child.id, `zettel ${child.id}`, prefer);
			  }
			  this.refresh();
			};
  
			// title
			const nameSpan = row.createSpan({ cls: ['zettel-name', 'zi-name'] });
			nameSpan.textContent = file ? file.basename : '';
			if (file) {
			  nameSpan.classList.add('clickable');
			  // 左クリック：通常 / Shift選択 / Ctrl新規タブ
			  nameSpan.onclick = async (ev) => {
				ev.stopPropagation();
				const idx = rowIndex ?? parseInt(row.dataset.rowindex || "-1", 10);
  
				if (ev.shiftKey && idx >= 0) {
				  // Shiftは選択のみ（開かない）
				  this.selectRange(idx);
				  this.refresh();
				  return;
				}
				if (ev.ctrlKey || ev.metaKey) {
				  // 新規タブで開く
				  const leaf = this.app.workspace.getLeaf(true);
				  await leaf.openFile(file);
				  return;
				}
  
				// 通常クリック：単一選択＋開く
				if (idx >= 0) this.selectSingle(idx);
				await this.app.workspace.getLeaf().openFile(file);
				this.refresh();
			  };
  
			  // 右クリック：メニュー
			  nameSpan.oncontextmenu = (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				const menu = new Menu();
				// 1) 新規タブで開く
				menu.addItem((item) => {
				  item.setTitle('新規タブで開く')
					.setIcon('split')
					.onClick(async () => {
					  const leaf = this.app.workspace.getLeaf(true);
					  await leaf.openFile(file);
					});
				});
				// 2) zettel_id を変更
				menu.addItem((item) => {
				  item.setTitle('zettel_id を変更')
					.setIcon('pencil')
					.onClick(async () => {
					  const prop = this.plugin.settings.zettelIdProperty;
					  const cur = this.plugin.getZettelIdForFile(file) ?? '';
					  const modal = new TextInputModal(this.app, {
						title: `${prop} を変更`,
						placeholder: '例: 1.a.2',
						value: cur,
					  });
					  modal.open();
					  const newId = await modal.wait();
					  if (newId === null) return;
					  try {
						await this.app.fileManager.processFrontMatter(file, (fm) => {
						  fm[prop] = newId;
						});
						new Notice(`${prop} を「${newId}」に更新しました`);
						this.plugin.invalidateCache();
						await new Promise((r) => setTimeout(r, 200));
						this.refresh();
					  } catch (e) {
						console.error(e);
						new Notice('更新に失敗しました', 4000);
					  }
					});
				});
				// 3) 名前を変更
				menu.addItem((item) => {
				  item.setTitle('名前を変更')
					.setIcon('edit')
					.onClick(async () => {
					  const base = file.basename;
					  const modal = new TextInputModal(this.app, {
						title: '新しいファイル名（拡張子不要）',
						placeholder: base,
						value: base,
					  });
					  modal.open();
					  const newBase = await modal.wait();
					  if (!newBase) return;
					  try {
						const parent = file.parent?.path ?? '';
						const newPath = `${parent}/${newBase}.md`;
						await this.app.fileManager.renameFile(file, newPath);
						new Notice(`名前を「${newBase}.md」に変更しました`);
						this.plugin.invalidateCache();
						await new Promise((r) => setTimeout(r, 200));
						this.refresh();
					  } catch (e) {
						console.error(e);
						new Notice('名前の変更に失敗しました', 4000);
					  }
					});
				});
  
				// 4) 削除（分割）
				menu.addItem((item) => {
				  item.setTitle('ファイル削除')
					.setIcon('trash')
					.onClick(async () => {
					  // 選択集合に含まれていれば集合、なければ単独
					  let targets: TFile[] = [];
					  if (this.selectedPaths.size > 1 && this.selectedPaths.has(file.path)) {
						targets = this.rowEntries
						  .filter(e => this.selectedPaths.has(e.file.path))
						  .map(e => e.file);
					  } else {
						targets = [file];
					  }
  
					  setTimeout(async () => {
						const cm = new ConfirmModal(this.app, `選択された ${targets.length} 件のファイルを削除します。よろしいですか？`);
						cm.open();
						const ok = await cm.wait();
						if (!ok) return;
  
						try {
						  for (const f of targets) {
							// eslint-disable-next-line no-await-in-loop
							await this.app.vault.delete(f);
						  }
						  new Notice('削除しました');
						  this.plugin.invalidateCache();
						  this.clearSelection();
						  this.refresh();
						} catch (e) {
						  console.error(e);
						  new Notice('削除に失敗しました', 4000);
						} finally {
						  this.app.workspace
							.getActiveViewOfType(MarkdownView)
							?.editor?.focus();
						}
					  }, 0);
					});
				});
  
				menu.addItem((item) => {
				  item.setTitle('配下を含め削除')
					.setIcon('trash-2')
					.onClick(async () => {
					  let baseFiles: TFile[] = [];
					  if (this.selectedPaths.size > 1 && this.selectedPaths.has(file.path)) {
						baseFiles = this.rowEntries
						  .filter(e => this.selectedPaths.has(e.file.path))
						  .map(e => e.file);
					  } else {
						baseFiles = [file];
					  }
  
					  const targets = this.collectDeleteTargets(true, baseFiles);
  
					  setTimeout(async () => {
						const cm = new ConfirmModal(this.app, `選択起点 ${baseFiles.length} 件の配下を含む ${targets.length} 件を削除します。よろしいですか？`);
						cm.open();
						const ok = await cm.wait();
						if (!ok) return;
  
						try {
						  for (const f of targets) {
							// eslint-disable-next-line no-await-in-loop
							await this.app.vault.delete(f);
						  }
						  new Notice('削除しました');
						  this.plugin.invalidateCache();
						  this.clearSelection();
						  this.refresh();
						} catch (e) {
						  console.error(e);
						  new Notice('削除に失敗しました', 4000);
						} finally {
						  this.app.workspace
							.getActiveViewOfType(MarkdownView)
							?.editor?.focus();
						}
					  }, 0);
					});
				});
  
				menu.showAtMouseEvent(ev);
			  };
			}
  
			// highlight
			if (
			  this.plugin.settings.focusCurrent &&
			  currentId && child.id === currentId &&
			  file && currentFile && file.path === currentFile.path
			) {
			  row.classList.add('is-highlight');
			  setTimeout(() => row.scrollIntoView({ block: 'center' }), 50);
			}
  
			// plus (first row only)
			if (i === 0) {
			  const plusBtn = row.createSpan({ cls: ['zettel-plus', 'zi-plus', 'clickable'], text: '+' });
			  plusBtn.onclick = async (evt) => {
				evt.stopPropagation();
				await this.plugin.createNextChildZettel(child);
				this.refresh();
			  };
			}
		  }
  
		  if (!isCollapsed) renderNode(child, depth + 1);
		});
	  };
	  renderNode(root, 0);
	}
  
	private renderNoZettelList(container: HTMLElement) {
	  const files = this.plugin.getFilesWithoutZettel();
	  const currentFile = this.app.workspace.getActiveFile();
  
	  container.empty();
  
	  files.forEach((file) => {
		const row = container.createDiv({ cls: ['no-zettel-row', 'zi-row', 'clickable'] });
		row.textContent = file.basename;
  
		// 左クリック：開く
		row.onclick = (ev) => {
		  ev.stopPropagation();
		  this.app.workspace.getLeaf().openFile(file);
		};
  
		// 右クリック：メニュー（新規タブで開く／名前変更／削除）
		row.oncontextmenu = (ev) => {
		  ev.preventDefault();
		  ev.stopPropagation();
  
		  const menu = new Menu();
  
		  // 1) 新規タブで開く
		  menu.addItem((item) => {
			item.setTitle('新規タブで開く')
			  .setIcon('split')
			  .onClick(async () => {
				const leaf = this.app.workspace.getLeaf(true);
				await leaf.openFile(file);
			  });
		  });
  
		  // 2) 名前を変更
		  menu.addItem((item) => {
			item.setTitle('名前を変更')
			  .setIcon('edit')
			  .onClick(async () => {
				const base = file.basename;
				const modal = new TextInputModal(this.app, {
				  title: '新しいファイル名（拡張子不要）',
				  placeholder: base,
				  value: base,
				});
				modal.open();
				const newBase = await modal.wait();
				if (!newBase) return;
				try {
				  const parent = file.parent?.path ?? '';
				  const newPath = `${parent}/${newBase}.md`;
				  await this.app.fileManager.renameFile(file, newPath);
				  new Notice(`名前を「${newBase}.md」に変更しました`);
				  this.plugin.invalidateCache();
				  await new Promise((r) => setTimeout(r, 200));
				  this.refresh();
				} catch (e) {
				  console.error(e);
				  new Notice('名前の変更に失敗しました', 4000);
				}
			  });
		  });
  
		  // 3) ファイル削除（確認あり）
		  menu.addItem((item) => {
			item.setTitle('ファイル削除')
			  .setIcon('trash')
			  .onClick(async () => {
				const cm = new ConfirmModal(this.app, `「${file.basename}.md」を削除します。よろしいですか？`);
				cm.open();
				const ok = await cm.wait();
				if (!ok) return;
				try {
				  await this.app.vault.delete(file);
				  new Notice('削除しました');
				  this.plugin.invalidateCache();
				  this.refresh();
				} catch (e) {
				  console.error(e);
				  new Notice('削除に失敗しました', 4000);
				}
			  });
		  });
  
		  menu.showAtMouseEvent(ev);
		};
  
		if (this.plugin.settings.focusCurrent && currentFile && file.path === currentFile.path) {
		  row.classList.add('is-highlight');
		  setTimeout(() => row.scrollIntoView({ block: 'center' }), 50);
		}
	  });
	}
  
	async onClose() { /* no-op */ }
  }
