import type { IconProps } from "./icon"

const paths: ReadonlyArray<string> = [
	"M19 21L16 21",
	"M8 21L5 21",
	"M21 16L21 19",
	"M14 16L14 19",
	"M10 16L10 19",
	"M3 16L3 19",
	"M19 14L16 14",
	"M8 14L5 14",
	"M8 10L5 10",
	"M17.5 8.5L17.5 10",
	"M19.5 6.5L21 6.5",
	"M14 6.5L15.5 6.5",
	"M10 5L10 8",
	"M3 5L3 8",
	"M17.5 3L17.5 4.5",
	"M8 3L5 3",
]

function GridSquareCirclePlusIcon({ size = 24, className, ...props }: IconProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width={size}
			height={size}
			className={className}
			fill="none"
			aria-hidden="true"
			{...props}
		>
			{paths.map((d, i) => (
				<path key={i} d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
			))}
		</svg>
	)
}
export { GridSquareCirclePlusIcon }
