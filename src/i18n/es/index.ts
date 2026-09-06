import type { Translation } from "../i18n-types.js";

const es = {
	// Sidebar
	library: "Biblioteca",
	newDocument: "+",
	newChapterLabel: "Nuevo capítulo",
	newFolder: "Nueva carpeta",
	folder: "Carpeta",
	folderTitleLabel: "Título de la carpeta",
	deleteFolder: "Eliminar carpeta",
	expandFolder: "Expandir",
	collapseFolder: "Contraer",
	folderNotEmpty: "Solo se puede eliminar una carpeta vacía.",
	projectTitle: "Proyecto sin título",

	// Editor
	placeholder: "Comienza a escribir...",
	untitled: "Sin título",
	chapterTitleLabel: "Título del capítulo",
	justNow: "Justo ahora",
	readingTime: "{minutes} min",

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
	statistics: "Estadísticas",
	outline: "Esquema",
	notes: "Notas",
	notesPlaceholder: "Anota ideas, recordatorios...",
	words: "Palabras",
	characters: "Caracteres",
	paragraphs: "Párrafos",
	readingTimeLabel: "Tiempo de lectura",

	// Statusbar
	wordCount: "{count} palabras",
	wordCountOf: "{count} / {total} palabras",
	sessionWords: "{count} en la sesión",
	charCount: "{count} caracteres",
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
	catDocument: "Documento",
	catView: "Vista",

	// Theme toggle
	toggleThemeLabel: "Alternar tema",

	// Start screen
	welcomeTitle: "Bienvenido a Sietch",
	welcomeSubtitle: "Tu refugio de escritura en el desierto",
	createProject: "Crear proyecto",
	openProject: "Abrir proyecto",
	projectNameLabel: "Nombre del proyecto",
	projectNamePlaceholder: "Mi Novela",
	create: "Crear",
	cancel: "Cancelar",
	errorNotProject: "Esta carpeta no es un proyecto de Sietch",
	recentProjects: "Proyectos recientes",
	removeFromRecents: "Quitar de recientes",

	// Dialogs
	saveFailedCloseAnyway:
		"No se pudieron guardar tus últimos cambios. ¿Cerrar de todos modos y perderlos?",
} satisfies Translation;

export default es;
