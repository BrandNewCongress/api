import Airtable from 'airtable'
import log from './log'
import {
  isEmpty,
  toTitleCase,
  formatDate,
  formatEmail,
  formatText,
  formatPhoneNumber,
  formatLink,
  formatStateAbbreviation,
  formatDistrictCode,
  formatDistrict,
  formatPoliticalParty,
  formatSourceTeamName
} from './lib'

class BNCAirtable {
  constructor() {
    this.base = new Airtable({
      apiKey: process.env.AIRTABLE_API_KEY
    }).base(process.env.AIRTABLE_BASE)
  }

  async findAll(table, filterOptions) {
    return new Promise((resolve, reject) => {
      let results = []
      this.base(table)
        .select(filterOptions)
        .eachPage((records, fetchNextPage) => {
          results = results.concat(records)
          fetchNextPage()
        }, (err) => {
          if (err) {
            log.error(err)
            reject(err)
          }
          resolve(results)
        })
    })
  }

  async findById(table, id) {
    return new Promise((resolve, reject) => {
      this.base(table)
        .find(id, (err, record) => {
          if (err) {
            log.error(err)
            reject(err)
          }
          resolve(record)
        })
    })
  }

  async findOne(table, formula) {
    const result = await this.findAll(table, {
      filterByFormula: formula,
      maxRecords: 1
    })
    return result[0]
  }

  async update(table, id, fields) {
    return new Promise((resolve, reject) => {
      this.base(table)
        .update(id, fields, (err, record) => {
          if (err) {
            log.error(err)
            reject(err)
          }
          resolve(record)
        })
    })
  }

  async create(table, fields) {
    return new Promise((resolve, reject) => {
      this.base(table)
        .create(fields, (err, record) => {
          if (err) {
            log.error(err)
            reject(err)
          }
          resolve(record)
        })
    })
  }

  async createOrUpdatePerson(personId, {
    emails,
    phones,
    facebook,
    linkedin,
    twitter,
    name,
    city,
    politicalParty,
    stateId,
    districtId
  }) {
    let person = null
    if (personId) {
      person = await this.findById('People', personId)
    } else {
      person = await this.create('People', {
        Name: name,
        Facebook: facebook,
        LinkedIn: linkedin,
        Twitter: twitter,
        'Political Party': politicalParty
      })
    }

    const personFieldsToUpdate = {}
    if (isEmpty(person.get('Name')) && name) {
      personFieldsToUpdate.Name = name
    }
    if (isEmpty(person.get('Facebook')) && facebook) {
      personFieldsToUpdate.Facebook = facebook
    }
    if (isEmpty(person.get('LinkedIn')) && linkedin) {
      personFieldsToUpdate.LinkedIn = linkedin
    }
    if (isEmpty(person.get('Twitter')) && twitter) {
      personFieldsToUpdate.Twitter = twitter
    }
    if (isEmpty(person.get('Political Party')) && politicalParty) {
      personFieldsToUpdate['Political Party'] = politicalParty
    }
    if (Object.keys(personFieldsToUpdate).length > 0) {
      await this.update('People', person.id, personFieldsToUpdate)
    }

    if (!isEmpty(phones)) {
      for (let index = 0; index < phones.length; index++) {
        const phone = phones[index]
        const existingPhone = await this.findOne('Phone Numbers', `{Phone Number} = '${phone}'`)
        if (!existingPhone) {
          await this.create('Phone Numbers', {
            'Phone Number': phone,
            Person: [person.id]
          })
        }
      }
    }

    if (!isEmpty(emails)) {
      for (let index = 0; index < emails.length; index++) {
        const email = emails[index]
        const existingEmail = await this.findOne('Emails', `{Email} = '${email}'`)
        if (!existingEmail) {
          await this.create('Emails', {
            Email: email,
            Person: [person.id]
          })
        }
      }
    }

    const addressIds = person.get('Addresses')
    let createAddress = true
    if (!isEmpty(addressIds)) {
      let index = 0
      for (index = 0; index < addressIds.length; index++) {
        const address = await this.findById('Addresses', addressIds[index])
        if ((!isEmpty(address.get('Congressional District')) && address.get('Congressional District')[0] === districtId) ||
            (!isEmpty(address.get('City')) && !isEmpty(city) && address.get('City').toLowerCase() === city.toLowerCase()) ||
            (!isEmpty(address.get('State')) && address.get('State')[0] === stateId && isEmpty(city) && isEmpty(districtId))) {
          const addressFieldsToUpdate = {}
          if (isEmpty(address.get('Congressional District')) && districtId) {
            addressFieldsToUpdate['Congressional District'] = [districtId]
          }
          if (isEmpty(address.get('City')) && city) {
            addressFieldsToUpdate.City = city
          }
          if (isEmpty(address.get('State')) && stateId) {
            addressFieldsToUpdate.State = [stateId]
          }
          await this.update('Addresses', address.id, addressFieldsToUpdate)
          break
        }
      }
      if (index !== addressIds.length) {
        createAddress = false
      }
    }
    if (createAddress) {
      if (!isEmpty(city) || !isEmpty(stateId) || !isEmpty(districtId)) {
        await this.create('Addresses', {
          City: city,
          State: stateId ? [stateId] : null,
          'Congressional District': districtId ? [districtId] : null,
          Person: [person.id]
        })
      }
    }

    return person
  }

  async matchPerson({
    emails, phones, facebook, linkedin, twitter, name, city, stateId, districtId
  }) {
    if (!isEmpty(emails)) {
      let matchString = ''
      emails.forEach((email) => {
        matchString = `${matchString} LOWER({Email})='${email.toLowerCase()}',`
      })
      matchString = `OR(${matchString.slice(0, -1)})`
      const emailRecord = await this.findOne('Emails', matchString)
      if (emailRecord) {
        return emailRecord.get('Person')[0]
      }
    }
    if (!isEmpty(phones)) {
      let matchString = ''
      phones.forEach((phone) => {
        matchString = `${matchString} {Phone Number}='${phone}',`
      })
      matchString = `OR(${matchString.slice(0, -1)})`
      const phoneRecord = await this.findOne('Phone Numbers', matchString)
      if (phoneRecord) {
        return phoneRecord.get('Person')[0]
      }
    }
    if (facebook || linkedin || twitter) {
      let matchString = 'OR('
      if (facebook) {
        matchString = `${matchString}{Facebook} = '${facebook}',`
      }
      if (linkedin) {
        matchString = `${matchString}{LinkedIn} = '${linkedin}',`
      }
      if (twitter) {
        matchString = `${matchString}{Twitter} = '${twitter}',`
      }
      matchString = `${matchString.slice(0, -1)})`

      const personRecord = await this.findOne('People', matchString)
      if (personRecord) {
        return personRecord.id
      }
    }
    if (name && (districtId || (city && stateId))) {
      const personRecords = await this.findAll('People', {
        filterByFormula: `LOWER({Name}) = '${name.toLowerCase()}'`
      })
      for (let index = 0; index < personRecords.length; index++) {
        const record = personRecords[index]
        const addressIds = record.get('Addresses')
        if (!isEmpty(addressIds)) {
          for (let innerIndex = 0; innerIndex < addressIds.length; innerIndex++) {
            const address = await this.findById('Addresses', addressIds[innerIndex])
            if ((!isEmpty(address.get('Congressional District')) && address.get('Congressional District')[0] === districtId) ||
              (!isEmpty(address.get('City')) && address.get('City').toLowerCase() === city.toLowerCase() && !isEmpty(address.get('State')) && address.get('State')[0] === stateId)) {
              return record.id
            }
          }
        }
      }
    }
    return null
  }

  async createNomination(rawNomination) {
    const nomination = {
      ...rawNomination,
      'Date Submitted (Legacy)': formatDate(rawNomination['Date Submitted (Legacy)']),
      Source: formatText(rawNomination.Source),
      'Run for Office': formatText(rawNomination['Run for Office'])
    }

    const nominatorEmails = rawNomination['Nominator Email']
      .split('\n')
      .map((email) => formatEmail(email))
      .filter((email) => !isEmpty(email))
    const nominatorPhones = rawNomination['Nominator Phone']
      .split('\n')
      .map((phone) => formatPhoneNumber(phone))
      .filter((phone) => !isEmpty(phone))
    const phones = rawNomination.Phone
      .split('\n')
      .map((phone) => formatPhoneNumber(phone))
      .filter((phone) => !isEmpty(phone))
    const emails = rawNomination.Email
      .split('\n')
      .map((email) => formatEmail(email))
      .filter((email) => !isEmpty(email))

    const cleanedNomination = {
      nominatorName: formatText(rawNomination['Nominator Name']),
      nominatorEmails,
      nominatorPhones,
      name: formatText(rawNomination.Name),
      emails,
      phones,
      city: toTitleCase(formatText(rawNomination.City)),
      stateAbbreviation: formatStateAbbreviation(rawNomination['State Abbreviation']),
      districtCode: formatDistrictCode(rawNomination['Congressional District Code']),
      facebook: formatLink(rawNomination.Facebook),
      linkedIn: formatLink(rawNomination.LinkedIn),
      twitter: formatLink(rawNomination.Twitter),
      politicalParty: formatPoliticalParty(rawNomination['Political Party']),
      sourceTeamName: formatSourceTeamName(rawNomination['Source Team Name']),
      submitterEmails: [formatEmail(rawNomination['Submitter Email']) || formatEmail(rawNomination['Nominator Email'])]
    }

    const state = await this.findOne('States', `{Abbreviation} = '${cleanedNomination.stateAbbreviation}'`)
    const stateId = state ? state.id : null

    const districtAbbreviation = formatDistrict(cleanedNomination.stateAbbreviation, cleanedNomination.districtCode)
    let districtId = null
    if (districtAbbreviation !== null) {
      const district = await this.findOne('Congressional Districts', `{ID} = '${districtAbbreviation}'`)
      districtId = district ? district.id : null
    }

    let nominator = await this.matchPerson({
      emails: cleanedNomination.nominatorEmails,
      phones: cleanedNomination.nominatorPhones
    })

    nominator = await this.createOrUpdatePerson(nominator, {
      name: cleanedNomination.nominatorName,
      emails: cleanedNomination.nominatorEmails,
      phones: cleanedNomination.nominatorPhones
    })

    let submitter = await this.matchPerson({
      emails: cleanedNomination.submitterEmails
    })
    submitter = await this.createOrUpdatePerson(submitter, {
      emails: cleanedNomination.submitterEmails
    })
    let nominee = await this.matchPerson({
      emails: cleanedNomination.emails,
      phones: cleanedNomination.phones,
      facebook: cleanedNomination.facebook,
      linkedin: cleanedNomination.linkedin,
      twitter: cleanedNomination.twitter,
      name: cleanedNomination.name,
      city: cleanedNomination.city,
      stateId,
      districtId
    })
    nominee = await this.createOrUpdatePerson(nominee, {
      emails: cleanedNomination.emails,
      phones: cleanedNomination.phones,
      facebook: cleanedNomination.facebook,
      linkedin: cleanedNomination.linkedin,
      twitter: cleanedNomination.twitter,
      name: cleanedNomination.name,
      city: cleanedNomination.city,
      politicalParty: cleanedNomination.politicalParty,
      stateId,
      districtId
    })

    let sourceTeam = null
    if (cleanedNomination.sourceTeamName) {
      sourceTeam = await this.findOne('Teams', `LOWER({Name}) = '${cleanedNomination.sourceTeamName.toLowerCase()}'`)
    }

    const nominationToSubmit = {
      ...nomination,
      State: stateId ? [stateId] : null,
      'Congressional District': districtId ? [districtId] : null,
      Person: [nominee.id],
      'Source Team': sourceTeam ? [sourceTeam.id] : null,
      Submitter: [submitter.id],
      Nominator: [nominator.id]
    }
    const createdNomination = await this.create('Nominations', nominationToSubmit)
    return createdNomination
  }
}

const BNCAirtableSingleton = new BNCAirtable()
export default BNCAirtableSingleton

