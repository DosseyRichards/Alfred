const axios = require('axios');
const cheerio = require('cheerio');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const cities = [
  'boston',
  'chicago',
  'dallas',
  'denver',
  'detroit',
  'houston',
  'lasvegas',
  'losangeles',
  'miami',
  'minneapolis',
  'newyork',
  'orangecounty',
  'philadelphia',
  'phoenix',
  'portland',
  'raleigh',
  'sacramento',
  'sandiego',
  'seattle',
  'sfbay',
  'washingtondc',
];

const categories = [
  'web',
  'mob',
  'des',
];

async function fetchJobDetails(url) {
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);

  const description = $('#postingbody').text();
  const contactInfo = $('p.reply-tel-email').text();

  return { description, contactInfo };
}

async function fetchJobListings(city, category) {
  const url = `https://${city}.craigslist.org/d/${category}/search/${category}`;
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);

  const jobListings = [];

  $('li.result-row').each(async (_, element) => {
    const title = $(element).find('.result-title').text();
    const link = $(element).find('.result-title').attr('href');
    const date = $(element).find('.result-date').attr('datetime');

    const { description, contactInfo } = await fetchJobDetails(link);

    const jobListing = {
      city,
      category,
      title,
      link,
      url: `https://${city}.craigslist.org${link}`, // Add the full URL
      date,
      description,
      contactInfo,
    };

    jobListings.push(jobListing);
    console.log(jobListing.url); // Log the URL in the console
  });

  return jobListings;
}

async function fetchJobListingsForAllCities() {
  const allJobListings = [];

  for (const city of cities) {
    for (const category of categories) {
      console.log(`Fetching job listings for ${category} in ${city}...`);
      const jobListings = await fetchJobListings(city, category);
      allJobListings.push(...jobListings);
    }
  }

  return allJobListings;
}

(async () => {
  const allJobListings = await fetchJobListingsForAllCities();

  const csvWriter = createCsvWriter({
    path: 'job_listings.csv',
    header: [
      { id: 'city', title: 'City' },
      { id: 'category', title: 'Category' },
      { id: 'title', title: 'Title' },
      { id: 'link', title: 'Link' },
      { id: 'date', title: 'Date' },
      { id: 'description', title: 'Description' },
      { id: 'contactInfo', title: 'Contact Info' },
    ],
  });

  await csvWriter.writeRecords(allJobListings);

  console.log('Job listings saved to job_listings.csv');
})();
