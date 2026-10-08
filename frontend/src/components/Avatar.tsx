type Props = {
  name: string
  url: string | null
  className?: string
}

export default function Avatar({ name, url, className = 'h-10 w-10 text-base' }: Props) {
  if (url) {
    return <img src={url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  }

  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}