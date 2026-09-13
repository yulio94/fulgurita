import type { Translation } from "../i18n-types.js";

const es = {
	// Sidebar
	library: "Biblioteca",
	view: "Vista",
	newChapterLabel: "Nuevo capítulo",
	newFolder: "Nueva carpeta",
	folder: "Carpeta",
	folderTitleLabel: "Título de la carpeta",
	deleteFolder: "Eliminar carpeta",
	rename: "Renombrar",
	deleteChapter: "Eliminar capítulo",
	expandFolder: "Expandir",
	collapseFolder: "Contraer",
	treeMoved: "Se movió {title} a {position} de {total} en {parent}",
	topLevel: "el nivel superior",
	deleteFolderConfirm:
		"¿Eliminar {title} y los {count} capítulos que contiene? Se moverán a la papelera del proyecto.",
	chapterTrashed: "Se movió {title} a la papelera",
	folderTrashed:
		"Se eliminó {title} y se movieron {count} capítulos a la papelera",
	projectTitle: "Proyecto sin título",
	viewEmpty: "Nada por aquí",

	// Papelera
	trash: "Papelera",
	restore: "Restaurar",
	deletedAgo: "Se eliminó {when}",
	inTheTrash: "En la papelera",
	chapterRestored: "Se restauró {title} al nivel superior",

	// Editor
	placeholder: "Comienza a escribir...",
	untitled: "Sin título",
	chapterEyebrow: "Capítulo {n}",
	chapterTitleLabel: "Título del capítulo",
	justNow: "Justo ahora",
	readingTime: "{minutes} min",
	changedOnDisk: "Este documento cambió fuera de Fulgurita.",
	reloadFromDisk: "Recargar",
	keepMine: "Conservar el mío",

	// Editor toolbar
	formatToolbarLabel: "Formato",
	fmtBold: "Negrita",
	fmtItalic: "Cursiva",
	fmtBlockquote: "Cita",
	fmtBulletList: "Lista con viñetas",
	fmtCode: "Código en línea",

	// Paragraph styles
	styleDropdownLabel: "Estilo de párrafo",
	styleGroupStructure: "Estructura",
	styleGroupSemantic: "Estilos",
	styleNoStyle: "Sin estilo",
	styleTitle: "Título",
	styleHeading1: "Encabezado 1",
	styleHeading2: "Encabezado 2",
	styleHeading3: "Encabezado 3",
	styleBlockQuote: "Cita",
	styleCodeBlock: "Bloque de código",
	styleAttribution: "Atribución",
	styleCaption: "Pie de foto",
	styleVerse: "Verso",
	styleCentered: "Texto centrado",

	// Inspector
	synopsis: "Sinopsis",
	synopsisPlaceholder: "¿Qué pasa en este capítulo?",
	statistics: "Estadísticas",
	outline: "Esquema",
	notes: "Notas",
	notesPlaceholder: "Anota ideas, recordatorios...",
	words: "Palabras",
	characters: "Caracteres",
	paragraphs: "Párrafos",
	readingTimeLabel: "Tiempo de lectura",

	// Inspector — tags
	tags: "Etiquetas",
	addTag: "Añadir una etiqueta",
	addTagPlaceholder: "POV, subtrama, cronología…",
	removeTag: "Quitar {tag}",
	tagColorLabel: "Color de {tag}",
	tagColorDefault: "Predeterminado",
	tagColorClay: "Arcilla",
	tagColorOlive: "Oliva",
	tagColorWater: "Agua",
	tagColorPlum: "Ciruela",
	tagColorEmber: "Brasa",
	tagColorSky: "Cielo",

	// Statusbar
	wordCount: "{count} palabras",
	wordCountOf: "{count} / {total} palabras",
	pageCount: "~{count} {{pages:página|páginas}}",
	pageEstimateHint:
		"Estimación: ~{trade} páginas en 6×9, ~{manuscript} en formato manuscrito.",
	sessionWords: "{count} en la sesión",
	readTimeStatus: "{time} de lectura",
	goalProgress: "{current} / {goal}",
	saveStateSaved: "Guardado",
	saveStateSavedAt: "Guardado {time}",
	saveStateSaving: "Guardando…",
	saveStateError: "Error",

	// Command palette
	commandPlaceholder: "Escribe un comando...",
	chapterPlaceholder: "Ir a capítulo...",
	cmdNewDocument: "Nuevo documento",
	cmdOpenChapter: "Abrir capítulo…",
	cmdSave: "Guardar",
	cmdToggleSidebar: "Alternar barra lateral",
	cmdToggleInspector: "Alternar inspector",
	cmdToggleFocusMode: "Alternar modo enfoque",
	cmdToggleTheme: "Alternar tema",
	cmdSettings: "Ajustes…",
	catDocument: "Documento",
	catView: "Vista",
	catProject: "Proyecto",

	// Titlebar
	toggleThemeLabel: "Alternar tema",
	themeDay: "Claro",
	themeNight: "Oscuro",
	focusModeLabel: "Modo enfoque",

	// Start screen
	welcomeTitle: "Bienvenido a Fulgurita",
	welcomeSubtitle: "Un lugar tranquilo para escribir.",
	createProject: "Crear proyecto",
	openProject: "Abrir proyecto",
	projectNameLabel: "Nombre del proyecto",
	projectNamePlaceholder: "Mi Novela",
	create: "Crear",
	cancel: "Cancelar",

	// Settings
	settingsTitle: "Ajustes",
	settingsSectionProject: "Proyecto",
	settingsSectionApp: "Aplicación",
	projectLanguageLabel: "Idioma del proyecto",
	projectLanguageHint:
		"Se aplica a los documentos nuevos. El frontmatter de cada archivo siempre manda.",
	projectTypeLabel: "Tipo de proyecto",
	projectTypeHint:
		"Qué clase de escritura contiene este proyecto. Los documentos nuevos y la exportación mantienen sus propios ajustes por ahora.",
	projectTypeNovel: "Novela",
	projectTypeLongform: "Periodismo",
	projectTypeThesis: "Tesis",
	projectTypeBlog: "Blog",
	themeLabel: "Apariencia",
	themeSystem: "Sistema",
	themeHint: "Sistema sigue la configuración clara u oscura de tu computadora.",
	dailyGoalLabel: "Meta diaria de palabras",
	dailyGoalHint:
		"Se mide contra lo que llevas escrito desde que abriste el proyecto.",
	typewriterLabel: "Desplazamiento de máquina de escribir",
	typewriterOff: "Desactivado",
	typewriterInFocus: "En modo enfoque",
	typewriterHint:
		"Mantiene la línea que escribes cerca del centro de la ventana.",
	appLanguageLabel: "Idioma de la interfaz",
	appLanguageHint: "Se aplica la próxima vez que abras Fulgurita.",
	appLanguageRestart: "Reinicia Fulgurita para ver la interfaz en este idioma.",
	restartPrompt:
		"¿Reiniciar Fulgurita ahora para aplicar el nuevo idioma de la interfaz?",
	restartNow: "Reiniciar ahora",
	restartLater: "Más tarde",
	done: "Listo",
	errorNotProject: "Esta carpeta no es un proyecto de Fulgurita",
	recentProjects: "Proyectos recientes",
	removeFromRecents: "Quitar de recientes",

	// Dialogs
	saveFailedCloseAnyway:
		"No se pudieron guardar tus últimos cambios. ¿Cerrar de todos modos y perderlos?",
	saveFailedRestartAnyway:
		"No se pudieron guardar tus últimos cambios. ¿Reiniciar de todos modos y perderlos?",
} satisfies Translation;

export default es;
