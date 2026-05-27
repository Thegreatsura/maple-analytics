import type { IconProps } from "./icon"

const paths: ReadonlyArray<string> = [
	"M14 20L16 20",
	"M22 17H22.01",
	"M2 17H8",
	"M18 16L18 18",
	"M12 16L12 18",
	"M14 14L16 14",
	"M10 10L8 10",
	"M22 7H16",
	"M2 7H2.01",
	"M12 6L12 8",
	"M6 6L6 8",
	"M10 4L8 4",
]

function SlidersIcon({ size = 24, className, ...props }: IconProps) {
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
export { SlidersIcon }
