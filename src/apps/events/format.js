const { candidateMap, calendarMap, originMap } = require('./data')
const moment = require('moment-timezone')

const timeZoneMap = {
  'Alaska': '-09:00',
  'Pacific Time (US & Canada)': '-07:00',
  'Mountain Time (US & Canada)': '-06:00',
  'Central Time (US & Canada)': '-05:00',
  'Eastern Time (US & Canada)': '-04:00'
}

module.exports = {
  event: e => {
    let tz = 'America/New_York'
    const tzTag = e.tags.filter(t => t.startsWith('Event Time Zone:'))[0]
    if (tzTag) {
      tz = tzTag.split(':')[1].trim()
    }

    const timeZoneOffset = '-' + moment(e.start_time).tz(tz).format().split('-')[3]

    return {
      id: e.id,
      url: `http://now.brandnewcongress.org/events${e.path}`,
      title: e.headline,
      intro: e.intro,
      startTime: new Date(e.start_time).toISOString(),
      endTime: new Date(e.end_time).toISOString(),
      timeZone: tz,
      timeZoneOffset: timeZoneOffset,
      venue: e.venue,
      candidate: calendarMap[e.calendar_id],
      calendar: e.calendar_id
    }
  },
  sam: {
    event: e => {
      let tz = 'America/New_York'
      const tzTag = e.tags.filter(t => t.startsWith('Event Time Zone:'))[0]
      if (tzTag) {
        tz = tzTag.split(':')[1].trim()
      }

      const timeZoneOffset = '-' + moment(e.start_time).tz(tz).format().split('-')[3]

      let type = 'Unknown'
      const typeTag = e.tags.filter(t => t.startsWith('Event Type:'))[0]
      if (typeTag) {
        type = typeTag.split(':')[1].trim()
      }

      return {
        id: e.id,
        url: `http://now.brandnewcongress.org/events${e.path}`,
        title: e.headline,
        intro: e.intro,
        startTime: e.start_time,
        endTime: e.end_time,
        timeZone: tz,
        timeZoneOffset: timeZoneOffset,
        venue: e.venue,
        candidate: calendarMap[e.calendar_id],
        calendar: e.calendar_id,
        type,
        contact: e.contact
      }
    }
  }
}
