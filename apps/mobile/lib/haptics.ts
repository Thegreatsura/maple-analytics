import * as Haptics from "expo-haptics"

/** Light tap — list rows, filter chips, span toggle, secondary buttons, switches */
export function hapticLight() {
	Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

/** Medium tap — primary buttons, filter apply */
export function hapticMedium() {
	Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
}

/** Selection tick — tab switching */
export function hapticSelection() {
	Haptics.selectionAsync().catch(() => {})
}

/** Success notification — pull-to-refresh, auth success */
export function hapticSuccess() {
	Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}

/** Warning notification — destructive actions */
export function hapticWarning() {
	Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
}

/** Error notification — auth failure */
export function hapticError() {
	Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
}
