/**Index.js handles core endpoints that are essential to gathering data related to volcanoes.  */

var express = require('express');
var router = express.Router();
const authorization = require("../middleware/authorization");

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Swagger UI' });
});

router.get('/api', function (req, res, next) {
  res.render('index', { title: 'Try using /docs to see documentation!' });
});

/* Data endpoints: 
*  /countries
*  /volcanoes
*  /volcano/{id}
*/

// country endpoint
router.get("/countries", function (req, res, next) {
  // Collect query parameters. Return error if parameters are entered.
  const queryParams = Object.keys(req.query);
  if (queryParams.length > 0) {
    const invalidParams = queryParams.join(", ");
    return res.status(400).json({ "error": true, "message": `Invalid query parameters: ${invalidParams} . Query parameters are not permitted.` })
  }

  // Return unique country names
  req.db.from('data').distinct("country").orderBy("country")
    .then((rows) => {
      const countries = rows.map(row => row.country);
      return res.status(200).json(countries);
    })
    .catch((err) => {
      //handle errors from data fetch
      console.error('Error retrieving data:1111111111111111', err);
      return res.status(500).json({ "error": true, "message": "Internal Server Error" });
    })
});

// volcanoes endpoint
router.get("/volcanoes", function (req, res, next) {
  const { country, populatedWithin, ...otherParams } = req.query;

  // Check for query parameters that aren't country or populatedWithin
  if (Object.keys(otherParams).length > 0) {
    return res.status(400).json({ "error": true, "message": "Invalid query parameters" });
  }

  // See if country is supplied
  if (!country) {
    return res.status(400).json({ "error": true, "message": "Country is a required query parameter" });
  }

  // populated within filter options
  const filterOptions = {
    "5km": "population_5km",
    "10km": "population_10km",
    "30km": "population_30km",
    "100km": "population_100km"
  }

  // See which filter option is chosen
  const filterOption = filterOptions[populatedWithin];

  let query = req.db.from('data').select("id", "name", "country", "region", "subregion").where({ "country": country });

  // Apply filter if option is chosen
  if (filterOption) {
    query = query.select(`${filterOption}`).where(`${filterOption}`, ">", 0);
  }

  query.then((rows) => {
    // return volcano data
    return res.status(200).json(rows.map(row => ({
      "id": row.id,
      "name": row.name,
      "country": row.country,
      "region": row.region,
      "subregion": row.subregion
    })));
  })
    .catch((err) => {
      // handle errors from data fetch
      console.log(err);
      return res.status(500).json({ "error": true, "message": "Internal Server Error" });
    });
});

// volcano endpoint
router.get("/volcano/:id", authorization, function (req, res, next) {
  // collect volcano ID from supplied parameters
  const id = req.params.id;

  // set fields to be collected
  let fields = ["id", "name", "country", "region", "subregion", "last_eruption", "summit", "elevation", "latitude", "longitude"];
  const populationFields = ["population_5km", "population_10km", "population_30km", "population_100km"];

  // if user is authenticated, show population data
  if (req.authenticated) {
    fields = fields.concat(populationFields);
  }

  // fetch volcano data based on supplied ID
  req.db.from('data').select(fields).where('id', '=', id)
    .then((rows) => {
      if (rows.length === 0) {
        return res.status(404).json({ "error": true, "message": `Volcano with ID: ${id} not found` });
      }
      else {
        const result = rows.map(row => ({
          "id": row.id,
          "name": row.name,
          "country": row.country,
          "region": row.region,
          "subregion": row.subregion,
          "last_eruption": row.last_eruption,
          "summit": row.summit,
          "elevation": row.elevation,
          "latitude": row.latitude,
          "longitude": row.longitude,
          // if user is authenticated, then also return population data
          "population_5km": req.authenticated ? row.population_5km : undefined,
          "population_10km": req.authenticated ? row.population_10km : undefined,
          "population_30km": req.authenticated ? row.population_30km : undefined,
          "population_100km": req.authenticated ? row.population_100km : undefined,
        }));
        return res.status(200).json(result[0]);
      }
    })
    .catch((err) => {
      if (!res.headersSent) {
        // handle data fetch error
        return res.status(500).json({ "Error": true, "Message": "Error executing MySQL query" });
      }
    });
  });

  /* Administration endpoints:
  *  /me
  */
  router.get("/me", function (req, res, next) {
    const name = "Shafi Uddin";
    const student_number = "n11245409";
    return res.status(200).json({ "name": name, "student_number": student_number });
  });

  module.exports = router;
