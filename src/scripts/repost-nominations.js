const monk = require('monk')
const db = monk(process.env.MONGODB_URI)
const request = require('superagent')

const query = {
  path: '/nominations'
}

db.get('API Logs').find(query).then(posts => {
  console.log(`Got ${posts.length} posts`)
  console.log(posts.slice(posts.length - 1))

  posts.slice(posts.length - 1).forEach(p => {
    request
    .post('https://api.brandnewcongress.org/nominations')
    .send(Object.assign(p.data, {forceSource: 'brandnewcongress.org'}))
    .end((err, res) => {
      console.log(`Success for ${JSON.stringify(p)}`)
    })
  })
})
