// Shared DOM builders of the panel pages. Every value goes in through textContent: no markup is parsed and no style is set, so
// text that comes from the government can only ever be shown as text.

/** An element holding one piece of text. */
export const text = (tag, value) => {
  const el = document.createElement(tag)
  el.textContent = value
  return el
}

/** A note: a paragraph with role="note" holding the text. */
export const note = (value) => {
  const el = text('p', value)
  el.setAttribute('role', 'note')
  return el
}

/** A box of the government's errors: a heading and one entry per error (code, message and, when present, the detail). */
export const errorSection = (box) => {
  const section = document.createElement('section')
  section.dataset.errors = ''
  section.append(text('h3', box.heading))
  const list = document.createElement('ul')
  for (const error of box.errors) {
    const item = document.createElement('li')
    item.append(text('strong', error.code), ' ', error.message)
    if (error.detail) item.append(' ', text('small', error.detail))
    list.append(item)
  }
  section.append(list)
  return section
}
