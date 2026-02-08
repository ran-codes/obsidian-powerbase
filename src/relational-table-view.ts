import { BasesView, BasesPropertyId, BasesEntry, BasesQueryResult, QueryController, Plugin, TFile } from 'obsidian';
import type { Root } from 'react-dom/client';
import type { TableRowData, ColumnMeta, SortConfig, RollupConfig, AggregationType, GroupData, QuickActionConfig, ColumnType } from './types';

/**
 * Module-level state for property filtering in view options.
 * Updated by the active view instance in onDataUpdated().
 *
 * This is a workaround for the Bases Plugin API limitation where
 * getViewOptions() is static and filter() only receives the property ID.
 */
const viewOptionsState = {
	/** All columns currently in this view (from config.getOrder()) */
	currentViewColumns: [] as string[],
	/** Columns detected as relations (wikilink arrays, file references, etc.) */
	detectedRelationColumns: [] as string[],
};

export class RelationalTableView extends BasesView {
	type = 'relational-table';
	private viewContainerEl: HTMLElement;
	private plugin: Plugin;
	private reactRoot: Root | null = null;
	private propertyTypes: Record<string, string> | null = null;

	constructor(
		controller: QueryController,
		containerEl: HTMLElement,
		plugin: Plugin
	) {
		super(controller);
		this.viewContainerEl = containerEl;
		this.plugin = plugin;
	}

	onload(): void {
		this.viewContainerEl.addClass('relational-table-container');
		this.loadPropertyTypes();
	}

	/**
	 * Load property types from .obsidian/types.json
	 */
	private async loadPropertyTypes(): Promise<void> {
		try {
			const typesPath = `${this.app.vault.configDir}/types.json`;
			const adapter = this.app.vault.adapter;
			if (await adapter.exists(typesPath)) {
				const content = await adapter.read(typesPath);
				const parsed = JSON.parse(content);
				this.propertyTypes = parsed?.types ?? null;
			}
		} catch (e) {
			console.warn('[RelationalTableView] Failed to load types.json:', e);
		}
	}

	onunload(): void {
		if (this.reactRoot) {
			this.reactRoot.unmount();
			this.reactRoot = null;
		}
	}

	async onDataUpdated(): Promise<void> {
		// Ensure property types are loaded before rendering
		if (!this.propertyTypes) {
			await this.loadPropertyTypes();
		}
		this.updateViewOptionsState();
		this.renderTable();
	}

	/**
	 * Update the module-level state used by getViewOptions() filters.
	 * Called before rendering so the config panel has current data.
	 */
	private updateViewOptionsState(): void {
		const { data, config } = this;
		if (!data?.data) return;

		const orderedProperties = config.getOrder();
		const entries = data.data;

		// Build temporary rows for relation detection
		const rows: TableRowData[] = entries.slice(0, 10).map((entry: BasesEntry) => {
			const row: TableRowData = { file: entry.file };
			for (const propId of orderedProperties) {
				row[propId as string] = this.unwrapValue(entry.getValue(propId));
			}
			return row;
		});

		const baseFolder = this.getBaseFolder(entries);

		// Update module-level state
		viewOptionsState.currentViewColumns = orderedProperties.map(p => String(p));
		viewOptionsState.detectedRelationColumns = orderedProperties
			.map(p => String(p))
			.filter(propId => this.detectRelationColumn(propId, rows, baseFolder));
	}

	private renderTable(): void {
		const { data, config } = this;
		if (!data) return;

		// Get ordered columns (typed as BasesPropertyId[])
		const orderedProperties = config.getOrder();

		// Transform BasesEntry[] into TableRowData[]
		const entries = data.data;
		if (!entries) return;

		const rows: TableRowData[] = entries.map((entry: BasesEntry) => {
			const row: TableRowData = { file: entry.file };
			for (const propId of orderedProperties) {
				const value = entry.getValue(propId);
				row[propId as string] = this.unwrapValue(value);
			}
			return row;
		});

		// Build column metadata
		const baseFolder = this.getBaseFolder(entries);
		const columns: ColumnMeta[] = orderedProperties.map((propId) => {
			const propIdStr = propId as string;
			const isRelation = this.detectRelationColumn(propIdStr, rows, baseFolder);
			const columnType = this.detectColumnType(propIdStr, rows, isRelation);
			return {
				propertyId: propIdStr,
				displayName: config.getDisplayName(propId),
				isRelation,
				columnType,
				relationFolderFilter: isRelation
					? this.inferRelationFolder(propIdStr, baseFolder)
					: undefined,
			};
		});

		// Compute rollup columns
		const rollupConfigs = this.getRollupConfigs();
		if (rollupConfigs.length > 0) {
			const { RollupService } = require('./services/RollupService');
			const rollupResults = RollupService.computeRollups(
				this.app,
				rows,
				rollupConfigs
			);

			// Inject computed values into row data
			for (const [rowIdx, rollupValues] of rollupResults) {
				for (const [rollupId, value] of rollupValues) {
					rows[rowIdx][rollupId] = value;
				}
			}

			// Add rollup columns to column list
			for (const rc of rollupConfigs) {
				columns.push({
					propertyId: rc.id,
					displayName: rc.displayName,
					isRelation: false,
					isRollup: true,
					rollupConfig: rc,
					columnType: 'rollup',
				});
			}
		}

		// Add quick actions column if configured
		const quickActionConfigs = this.getQuickActionConfigs();
		if (quickActionConfigs.length > 0) {
			columns.push({
				propertyId: '__quickActions',
				displayName: 'Actions',
				isRelation: false,
				isQuickActions: true,
				columnType: 'actions',
			});
		}

		// Get sort config for display indicators
		const sortEntries = config.getSort() || [];
		const sortConfig: SortConfig[] = sortEntries.map((s) => ({
			propertyId: s.property as string,
			direction: s.direction as 'ASC' | 'DESC',
		}));

		// Grouping disabled - use flat rendering only

		// Build summary values if available
		let summaryValues: Record<string, any> | undefined;
		try {
			const sv: Record<string, any> = {};
			let hasSummary = false;
			for (const propId of orderedProperties) {
				try {
					const summaryVal = (data as any).getSummaryValue?.(propId);
					if (summaryVal !== undefined && summaryVal !== null) {
						sv[propId as string] = this.unwrapValue(summaryVal);
						hasSummary = true;
					}
				} catch {
					// No summary for this property
				}
			}
			if (hasSummary) {
				summaryValues = sv;
			}
		} catch {
			// Summary not available
		}

		// Mount React
		if (!this.reactRoot) {
			const { createRoot } = require('react-dom/client');
			this.reactRoot = createRoot(this.viewContainerEl);
		}

		// Render
		const React = require('react');
		const { AppContext } = require('./components/AppContext');
		const { RelationalTable } = require('./components/RelationalTable');

		this.reactRoot!.render(
			React.createElement(
				AppContext.Provider,
				{ value: this.app },
				React.createElement(RelationalTable, {
					rows,
					columns,
					sortConfig,
					summaryValues,
					baseFolder,
					onUpdateRelation: this.handleUpdateRelation.bind(this),
					onUpdateCell: this.handleUpdateCell.bind(this),
					quickActions: quickActionConfigs.length > 0 ? quickActionConfigs : undefined,
					onExecuteQuickAction: quickActionConfigs.length > 0
						? this.handleExecuteQuickAction.bind(this)
						: undefined,
					onHideColumn: this.handleHideColumn.bind(this),
					onSortColumn: this.handleSortColumn.bind(this),
				})
			)
		);
	}

	/**
	 * Unwrap Obsidian Value objects into JS primitives.
	 *
	 * Runtime shape (minified): { icon, data, lazyEvaluator? }
	 * - ListValue.data = Value[] (array of nested Value objects)
	 * - PrimitiveValue.data = string | number | boolean
	 * - LinkValue.data = string (path, may or may not include [[]])
	 *
	 * See .claude/reference/v0.1/obsidian-value-api.md
	 */
	private unwrapValue(value: any): unknown {
		if (value === null || value === undefined) return null;

		// Obsidian Value objects have .data as the actual value
		if (value.data !== undefined) {
			if (Array.isArray(value.data)) {
				return value.data.map((v: any) => this.unwrapValue(v));
			}
			// Recurse if .data is a nested Value (has its own .data),
			// otherwise return the primitive directly
			if (value.data !== null && typeof value.data === 'object' && 'data' in value.data) {
				return this.unwrapValue(value.data);
			}
			return value.data;
		}

		// Fallback: if it's a non-null object with a custom toString(), use that
		if (typeof value === 'object' && typeof value.toString === 'function'
			&& value.toString !== Object.prototype.toString) {
			return value.toString();
		}

		return value;
	}

	/**
	 * Detect if a column contains relation values.
	 * Checks four patterns:
	 * 1a. Wikilink list: array where elements match [[...]]
	 * 1b. Path list: array where elements resolve to vault files (handles
	 *     LinkValue.data returning paths without brackets)
	 * 2.  Text reference: scalar string matching a vault file basename/alias
	 * 3.  Folder match: property name matches a subfolder (e.g. "project" → "projects/").
	 *     Catches columns that are currently empty but structurally relational.
	 * Scans first 10 rows for patterns 1–2, then falls back to pattern 3.
	 */
	private detectRelationColumn(propId: string, rows: TableRowData[], baseFolder?: string): boolean {
		if (!propId.startsWith('note.')) return false;

		const { WIKILINK_REGEX } = require('./services/ParseService');
		const { NoteSearchService } = require('./services/NoteSearchService');
		const sampled = rows.slice(0, 10);

		// Pattern 1: array values (wikilinks or file paths)
		for (const row of sampled) {
			const val = row[propId];
			if (!Array.isArray(val) || val.length === 0) continue;
			if (!val.every((item: any) => typeof item === 'string')) continue;

			// 1a: all items are wikilinks
			if (val.every((item: string) => WIKILINK_REGEX.test(item))) {
				return true;
			}

			// 1b: all items resolve to vault files within baseFolder (covers LinkValue.data
			//     returning bare paths like "Project Alpha" instead of "[[Project Alpha]]")
			if (val.every((item: string) =>
				NoteSearchService.isTextReference(this.app, item, baseFolder)
			)) {
				return true;
			}
		}

		// Pattern 2: scalar text references (e.g. project: "My Project")
		// Only matches files within the baseFolder to avoid false positives
		let textRefHits = 0;
		let textRefSamples = 0;
		for (const row of sampled) {
			const val = row[propId];
			if (val === null || val === undefined || val === '') continue;
			if (typeof val !== 'string') continue;
			if (WIKILINK_REGEX.test(val)) continue;
			textRefSamples++;
			if (NoteSearchService.isTextReference(this.app, val, baseFolder)) {
				textRefHits++;
			}
		}
		if (textRefSamples >= 2 && textRefHits / textRefSamples > 0.5) {
			return true;
		}

		// Pattern 3: property name matches a subfolder (e.g. "project" → "projects/")
		// Catches columns that are currently empty but structurally relational.
		if (this.matchRelationSubfolder(propId, baseFolder)) {
			return true;
		}

		return false;
	}

	/**
	 * Detect the column data type for header icon display.
	 * First checks Obsidian's property type registry, then falls back to data detection.
	 */
	private detectColumnType(propId: string, rows: TableRowData[], isRelation: boolean): ColumnType {
		// Special columns
		if (propId === 'file.name') return 'file';
		if (isRelation) return 'relation';
		if (propId === 'note.tags' || propId.endsWith('.tags')) return 'tags';

		// Check Obsidian's property type registry
		const propertyName = this.extractPropertyName(propId);
		const registeredType = this.propertyTypes?.[propertyName];
		if (registeredType) {
			switch (registeredType) {
				case 'multitext': return 'list';
				case 'tags': return 'tags';
				case 'checkbox': return 'checkbox';
				case 'number': return 'number';
				case 'date': return 'date';
				case 'datetime': return 'datetime';
				case 'text':
				default:
					// Fall through to data detection for text types
					break;
			}
		}

		// Fall back to data-based detection
		for (const row of rows.slice(0, 10)) {
			const val = row[propId];
			if (val === null || val === undefined) continue;

			if (typeof val === 'boolean') return 'checkbox';
			if (typeof val === 'number') return 'number';
			if (Array.isArray(val)) return 'list';
			if (typeof val === 'string') return 'text';
		}

		return 'text'; // Default
	}

	/**
	 * Handle relation updates from the React table.
	 * Writes wikilinks to frontmatter via EditEngineService.
	 */
	private async handleUpdateRelation(
		file: TFile,
		propertyId: string,
		newLinks: string[]
	): Promise<void> {
		const { EditEngineService } = require('./services/EditEngineService');
		const { BidirectionalSyncService } = require('./services/BidirectionalSyncService');

		const propertyName = this.extractPropertyName(propertyId);

		// Read old links before overwriting (for bidi diff)
		const oldEntry = this.data?.data?.find(
			(e: BasesEntry) => e.file.path === file.path
		);
		const oldRaw = oldEntry
			? this.unwrapValue(
					oldEntry.getValue(propertyId as BasesPropertyId)
			  )
			: [];
		const oldLinks = Array.isArray(oldRaw)
			? oldRaw.filter((v: any) => typeof v === 'string')
			: [];

		// Persist the primary edit
		EditEngineService.getInstance(this.app).updateRowFile({
			file,
			propertyName,
			value: newLinks,
		});

		// Sync back-links (non-blocking)
		// Look up reverse property name from bidi config
		const bidiConfigs = this.getBidiConfigs();

		// Normalize comparison: config may store "project" or "note.project"
		const propertyNameOnly = this.extractPropertyName(propertyId);
		const bidiMatch = bidiConfigs.find((b) =>
			b.column === propertyId ||
			b.column === propertyNameOnly ||
			`note.${b.column}` === propertyId
		);

		if (bidiMatch?.reverseProperty) {
			BidirectionalSyncService.syncBackLinks(
				this.app,
				file,
				bidiMatch.reverseProperty,
				oldLinks,
				newLinks
			);
		}
	}

	/**
	 * Handle inline cell edits from the React table.
	 * Writes the new value to frontmatter via EditEngineService.
	 */
	private handleUpdateCell(
		file: TFile,
		propertyId: string,
		value: any
	): void {
		const { EditEngineService } = require('./services/EditEngineService');
		const propertyName = this.extractPropertyName(propertyId);
		EditEngineService.getInstance(this.app).updateRowFile({
			file,
			propertyName,
			value,
		});
	}

	/**
	 * Hide a column by removing it from the order.
	 */
	private handleHideColumn(columnId: string): void {
		const currentOrder = this.config.getOrder();
		const newOrder = currentOrder.filter(id => String(id) !== columnId);
		// Note: The API may not support modifying order directly
		// This is a best-effort implementation
		(this.config as any).set?.('order', newOrder);
	}

	/**
	 * Sort by a column.
	 */
	private handleSortColumn(columnId: string, direction: 'ASC' | 'DESC' | null): void {
		if (direction === null) {
			// Clear sort
			(this.config as any).set?.('sort', []);
		} else {
			(this.config as any).set?.('sort', [{
				property: columnId,
				direction,
			}]);
		}
	}

	/**
	 * Group by a column.
	 */

	/**
	 * Extract frontmatter key from BasesPropertyId.
	 * "note.related-projects" → "related-projects"
	 */
	private extractPropertyName(propertyId: string): string {
		const dotIndex = propertyId.indexOf('.');
		return dotIndex >= 0 ? propertyId.substring(dotIndex + 1) : propertyId;
	}

	/**
	 * Infer a subfolder for a relation column's picker based on the property name.
	 * e.g. property "note.project" → look for "test-v1/project/" or "test-v1/projects/"
	 * Falls back to baseFolder if no matching subfolder found.
	 */
	private inferRelationFolder(propId: string, baseFolder?: string): string | undefined {
		return this.matchRelationSubfolder(propId, baseFolder) ?? baseFolder;
	}

	/**
	 * Check if a property name matches a subfolder under the base folder.
	 * Returns the matched subfolder path, or undefined if no match.
	 * Used for both folder filtering and as a relation detection signal.
	 */
	private matchRelationSubfolder(propId: string, baseFolder?: string): string | undefined {
		if (!baseFolder) return undefined;

		const propName = this.extractPropertyName(propId).toLowerCase();
		const candidates = [
			`${baseFolder}/${propName}`,
			`${baseFolder}/${propName}s`,
		];
		// Also try without trailing 's' if propName already ends with 's'
		if (propName.endsWith('s') && propName.length > 1) {
			candidates.push(`${baseFolder}/${propName.slice(0, -1)}`);
		}

		for (const candidate of candidates) {
			const folder = this.app.vault.getAbstractFileByPath(candidate);
			if (folder && 'children' in folder) {
				return candidate;
			}
		}

		return undefined;
	}

	/**
	 * Derive the base's root folder from the entries.
	 * Takes the common parent folder of all entries, then goes one level up
	 * to include sibling folders (e.g. tasks/ entries → parent test-v1/).
	 */
	private getBaseFolder(entries: BasesEntry[]): string | undefined {
		if (!entries || entries.length === 0) return undefined;

		const folders = entries.map((e) => {
			const lastSlash = e.file.path.lastIndexOf('/');
			return lastSlash >= 0 ? e.file.path.substring(0, lastSlash) : '';
		});

		// Find common prefix
		let common = folders[0];
		for (let i = 1; i < folders.length; i++) {
			while (!folders[i].startsWith(common)) {
				const lastSlash = common.lastIndexOf('/');
				common = lastSlash >= 0 ? common.substring(0, lastSlash) : '';
				if (!common) return undefined;
			}
		}

		// Go one level up to include sibling folders
		const parentSlash = common.lastIndexOf('/');
		return parentSlash >= 0 ? common.substring(0, parentSlash) : common || undefined;
	}

	/**
	 * Parse rollup configuration from view options.
	 */
	private getRollupConfigs(): RollupConfig[] {
		const count = parseInt(
			String(this.config.get('rollupCount') ?? '0'),
			10
		);
		const configs: RollupConfig[] = [];

		for (let i = 1; i <= count; i++) {
			const relation = this.config.get(`rollup${i}_relation`) as string | undefined;
			const target = this.config.get(`rollup${i}_target`) as string | undefined;
			const aggregation =
				(this.config.get(`rollup${i}_aggregation`) as string) || 'count';
			const name =
				(this.config.get(`rollup${i}_name`) as string) || `Rollup ${i}`;

			if (relation && target) {
				configs.push({
					id: `rollup_${i}`,
					displayName: name,
					relationPropertyId: relation,
					targetProperty: target,
					aggregation: aggregation as AggregationType,
				});
			}
		}

		return configs;
	}

	/**
	 * Parse bidirectional sync configuration from view options.
	 */
	private getBidiConfigs(): { column: string; reverseProperty: string }[] {
		const count = parseInt(
			String(this.config.get('bidiCount') ?? '0'),
			10
		);
		const configs: { column: string; reverseProperty: string }[] = [];

		for (let i = 1; i <= count; i++) {
			const column = this.config.get(`bidi${i}_column`) as string | undefined;
			const reverse = this.config.get(`bidi${i}_reverse`) as string | undefined;

			if (column && reverse) {
				configs.push({
					column,
					reverseProperty: reverse,
				});
			}
		}

		return configs;
	}

	/**
	 * Parse quick action configuration from view options DSL.
	 */
	private getQuickActionConfigs(): QuickActionConfig[] {
		const { QuickActionService } = require('./services/QuickActionService');
		const dsl = this.config.get('quickActions') as string | undefined;
		if (!dsl?.trim()) return [];
		return QuickActionService.parseDSL(dsl);
	}

	/**
	 * Execute a quick action on a file.
	 * Uses processFrontMatter for atomic updates.
	 */
	private async handleExecuteQuickAction(
		file: TFile,
		action: QuickActionConfig
	): Promise<void> {
		const { QuickActionService } = require('./services/QuickActionService');
		await QuickActionService.execute(this.app, file, action.updates);
	}

	static getViewOptions(): any[] {
		const aggregationOptions: Record<string, string> = {
			'count': 'Count (all links)',
			'count_values': 'Count Values (non-empty)',
			'sum': 'Sum',
			'average': 'Average',
			'min': 'Min',
			'max': 'Max',
			'list': 'List (all values)',
			'unique': 'Unique (deduplicated)',
			'percent_true': 'Percent True',
			'percent_not_empty': 'Percent Not Empty',
		};

		// Filter: only relation columns detected in current view
		// Falls back to note.* if view hasn't rendered yet
		const isRelationColumn = (prop: string) => {
			if (viewOptionsState.detectedRelationColumns.length > 0) {
				return viewOptionsState.detectedRelationColumns.includes(prop);
			}
			// Fallback: show all note.* properties
			return prop.startsWith('note.');
		};

		// Filter: only columns in current view (for target property)
		// Falls back to note.* if view hasn't rendered yet
		const isViewColumn = (prop: string) => {
			if (viewOptionsState.currentViewColumns.length > 0) {
				return viewOptionsState.currentViewColumns.includes(prop);
			}
			// Fallback: show all note.* properties
			return prop.startsWith('note.');
		};

		// Each rollup gets its own collapsible group
		const rollupGroup = (index: number): any => ({
			type: 'group',
			displayName: `Rollup ${index}`,
			shouldHide: (config: any) =>
				parseInt(config.get('rollupCount') ?? '0', 10) < index,
			items: [
				{
					type: 'property',
					key: `rollup${index}_relation`,
					displayName: 'Relation Property',
					placeholder: 'Select relation column...',
					filter: isRelationColumn,
				},
				{
					type: 'property',
					key: `rollup${index}_target`,
					displayName: 'Target Property',
					placeholder: 'Property to aggregate...',
					filter: isViewColumn,
				},
				{
					type: 'dropdown',
					key: `rollup${index}_aggregation`,
					displayName: 'Aggregation',
					default: 'count',
					options: aggregationOptions,
				},
				{
					type: 'text',
					key: `rollup${index}_name`,
					displayName: 'Column Name',
					default: `Rollup ${index}`,
					placeholder: 'Display name...',
				},
			],
		});

		// Each bidi sync gets its own collapsible group
		const bidiGroup = (index: number): any => ({
			type: 'group',
			displayName: `Bidi Sync ${index}`,
			shouldHide: (config: any) =>
				parseInt(config.get('bidiCount') ?? '0', 10) < index,
			items: [
				{
					type: 'property',
					key: `bidi${index}_column`,
					displayName: 'Relation Column',
					placeholder: 'Select relation column...',
					filter: isRelationColumn,
				},
				{
					type: 'text',
					key: `bidi${index}_reverse`,
					displayName: 'Write Back-Link To',
					placeholder: 'Property name on linked notes...',
				},
			],
		});

		return [
			// Master settings (always visible)
			{
				type: 'dropdown',
				key: 'relationDetection',
				displayName: 'Relation Detection',
				default: 'auto',
				options: {
					'auto': 'Auto-detect (list of wikilinks)',
					'manual': 'Select property',
				},
			},
			{
				type: 'dropdown',
				key: 'rollupCount',
				displayName: 'Number of Rollups',
				default: '0',
				options: {
					'0': 'None',
					'1': '1',
					'2': '2',
					'3': '3',
				},
			},
			{
				type: 'dropdown',
				key: 'bidiCount',
				displayName: 'Number of Bidi Syncs',
				default: '0',
				options: {
					'0': 'None',
					'1': '1',
					'2': '2',
					'3': '3',
				},
			},
			{
				type: 'text',
				key: 'quickActions',
				displayName: 'Quick Actions',
				placeholder: 'Done:status=done,completed=TODAY;Archive:archived=TRUE',
				default: '',
			},
			// Drill-down groups (collapsible, conditional)
			rollupGroup(1),
			rollupGroup(2),
			rollupGroup(3),
			bidiGroup(1),
			bidiGroup(2),
			bidiGroup(3),
		];
	}
}
