const Tabs = require('hypertabs')
const h = require('../h')
const keyscroll = require('../keyscroll')
const open = require('open-external')
const { webFrame, remote } = require('electron') || {}

function ancestor (el) {
  if(!el) return
  if(el.tagName !== 'A') return ancestor(el.parentElement)
  return el
}

exports.needs = {
  page: 'first',
  menu: 'first',
  helpers: {
    build_scroller: 'first',
    external_confirm:'first',
  },
  search_box: 'first'
}

exports.gives = 'page'

exports.create = function (api) {
  return function (path) {
    if(path !== 'tabs') return

    function setSelected (indexes) {
      const ids = indexes.map(index => tabs.get(index).content.id)
      if(search)
        if(ids.length > 1)
          search.input.value = 'split('+ids.join(',')+')'
        else
          search.input.value = ids[0]
    }

    const tabs = Tabs(setSelected)
    const search = api.search_box((path, change) => {
      if(tabs.has(path)) {
        tabs.select(path)
        return true
      }

      const el = api.page(path)
      if (!el) return

      if(!el.title) el.title = path
      el.scroll = keyscroll(el.querySelector('.Scroller .\\.content'))
      tabs.add(el, change)
//      localStorage.openTabs = JSON.stringify(tabs.tabs)
      return change
    })

    // TODO add options to Tabs : e.g. Tabs(setSelected, { append: el })
    tabs.firstChild.appendChild(
      h('div.extra', [
        search,
        api.menu()
      ])
    )

    var saved = []
  //  try { saved = JSON.parse(localStorage.openTabs) }
  //  catch (_) { }

    if(!saved || saved.length < 3)
      saved = ['/public', '/private', '/notifications', '/data']

    saved.forEach(function (path) {
      var el = api.page(path)
      if(!el) return
      el.id = el.id || path
      if (!el) return
      el.scroll = keyscroll(el.querySelector('.Scroller .\\.content'))
      if(el) tabs.add(el, false, false)
    })

    tabs.select(0)
    search.input.value = null // start with an empty field to show placeholder

    //handle link clicks
    window.onclick = function (ev) {
      var link = ancestor(ev.target)
      if(!link) return
      var path = link.hash.substring(1)

      ev.preventDefault()
      ev.stopPropagation()

      //let the application handle this link
      if (link.getAttribute('href') === '#') return

      //open external links.
      //this ought to be made into something more runcible
      if(link.href && open.isExternal(link.href)) return api.helpers.external_confirm(link.href)

      if(tabs.has(path))
        return tabs.select(path, !ev.ctrlKey, !!ev.shiftKey)

      var el = api.page(path)
      if(el) {
        el.id = el.id || path
        el.scroll = keyscroll(el.querySelector('.Scroller .\\.content'))
        tabs.add(el, !ev.ctrlKey, !!ev.shiftKey)
  //      localStorage.openTabs = JSON.stringify(tabs.tabs)
      }

      return false
    }

    var gPressed = false
    window.addEventListener('keydown', function (ev) {
      if (ev.target.nodeName === 'INPUT' || ev.target.nodeName === 'TEXTAREA')
        return

      // scroll to top
      if (ev.keyCode == 71) { // g
        if (!gPressed) return gPressed = true
        var el = tabs.get(tabs.selected[0]).firstChild.scroll('first')
        gPressed = false
      } else {
        gPressed = false
      }

      switch(ev.keyCode) {
        // scroll through tabs
        case 72: // h
          return tabs.selectRelative(-1)
        case 76: // l
          return tabs.selectRelative(1)

        // scroll through messages
        case 74: // j
          return tabs.get(tabs.selected[0]).firstChild.scroll(1)
        case 75: // k
          return tabs.get(tabs.selected[0]).firstChild.scroll(-1)

        // close a tab
        case 88: // x
          if (tabs.selected) {
            var sel = tabs.selected
            var i = sel.reduce(function (a, b) { return Math.min(a, b) })
            tabs.remove(sel)
            tabs.select(Math.max(i-1, 0))
          }
          return

        // activate the search field
        case 191: // /
          if (ev.shiftKey)
            search.activate('?', ev)
          else
            search.activate('/', ev)
          return

        // navigate to a feed
        case 50: // 2
          if (ev.shiftKey)
            search.activate('@', ev)
          return

        // navigate to a channel
        case 51: // 3
          if (ev.shiftKey)
            search.activate('#', ev)
          return

        // navigate to a message
        case 53: // 5
          if (ev.shiftKey)
            search.activate('%', ev)
          return
      }
    })

    // errors tab
    var {
      container: errors,
      content: errorsContent 
    } = api.helpers.build_scroller()

    // remove loader error handler
    if (window.onError) {
      window.removeEventListener('error', window.onError)
      delete window.onError
    }

    // put errors in a tab
    window.addEventListener('error', ev => {
      const err = ev.error || ev
      if(!tabs.has('errors'))
        tabs.add(errors, false)
      const el = h('div.message', [
        h('strong', err.message),
        h('pre', err.stack)
      ])
      if (errorsContent.firstChild)
        errorsContent.insertBefore(el, errorsContent.firstChild)
      else
        errorsContent.appendChild(el)
    })

    if (process.versions.electron) {
      window.addEventListener('mousewheel', ev => {
        const { ctrlKey, deltaY } = ev
        if (ctrlKey) {
          const direction = (deltaY / Math.abs(deltaY))
          const currentZoom = webFrame.getZoomLevel()
          webFrame.setZoomLevel(currentZoom - direction)
        }
      })

      window.addEventListener('contextmenu', ev => {
        ev.preventDefault()
        const Menu = remote.Menu
        const MenuItem = remote.MenuItem
        const menu = new Menu()
        menu.append(new MenuItem({
          label: 'Inspect Element',
          click: () => {
            remote.getCurrentWindow().inspectElement(ev.x, ev.y)
          }
        }))
        menu.popup(remote.getCurrentWindow())
      })
    }

    return tabs
  }

}
