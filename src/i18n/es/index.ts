import type { Translation } from "../i18n-types.js";

const es = {
	// Sidebar
	library: "Biblioteca",
	newDocument: "+",
	projectTitle: "Proyecto sin título",

	// Editor
	placeholder: "Comienza a escribir...",
	untitled: "Sin título",
	justNow: "Justo ahora",
	readingTime: "{minutes} min",

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
	charCount: "{count} caracteres",
	readTimeStatus: "{time} de lectura",
	goalProgress: "{current} / {goal}",

	// Command palette
	commandPlaceholder: "Escribe un comando...",
	cmdNewDocument: "Nuevo documento",
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
} satisfies Translation;

export default es;
