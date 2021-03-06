var Q              = require("q"),
    EventEmitter   = require("events").EventEmitter,
    services       = require("../services.json").services,
    http           = require("./http-promise"),
    logger         = require("./logger")(__filename),
    nitroAPIKey    = process.env.NITRO_API_KEY;

if(typeof nitroAPIKey === "undefined") {
  logger.error("NITRO_API_KEY not found in ENV");
  process.exit();
}

module.exports = { create: create };

function create() {
  var instance    = new EventEmitter,
      httpPromise = Q.nbind(http.get);

  services.forEach(fetchNowNext);

  return instance;

  function fetchNowNext(service) {
    var url;

    if(service.id=="emfm"){
//assume same format as Nitro
       var host = service.metadataHost;
       var path = service.metadataPath;
       url = {host: host, path: path}
    }else{
      url = nitroURL(service.nitroId);
    }

    return fetchURL(url)
           .then(parseNowNext, parseError)
           .then(function(nowNext) {
             setNowNextInterval(service, nowNext[0]);
             logger.debug(service.id, nowNext);
             instance.emit("message", service.id, nowNext);
            })
            .then(null, function(err) {
              logger.warn(err);
              setNowNextInterval(service, {});
            });

    function parseError(err) {
      logger.error(service.id, service.nitroId, err);
    }
  }

  function nitroURL(stationId) {
    var timeNow = (new Date()).toISOString(),
        host   = "d.bbc.co.uk",
        prefix = "/nitro/api/broadcasts?page_size=2&mixin=titles",
        path   =  prefix
                 +"&end_from="+timeNow
                 +"&sid="+stationId
                 +"&api_key="+nitroAPIKey;

    return {host: host, path: path};
  }

  function fetchURL(uri) {
console.log(uri);
    var request = {
          hostname: uri.host,
          path: uri.path,
          headers: {
            "Accept": "application/json"
          }
        };

    return http.get(request);
  }

  function parseNowNext(json) {
   console.log(json);
    var nowNext, data;

    try {
      var d = JSON.parse(json);
      if(d.nitro){
         data = d.nitro;

         nowNext = data.results.items.map(function(programme) {
         var parsed;

         try {
           parsed = parseProgramme(programme);
         } catch(err) {
           logger.warn(err);
           parsed = [];
         }

         return parsed;
       });

      }else{
        try{
          data = JSON.parse(json).track;
console.log("DATA");
console.log(data);
          res     = {};
          res.episode   = data.title;
          res.id        = data._id;
          nowNext = [res,{}];

        }catch(err2){
          logger.warn(err2.toString());
          return Q.reject(err2);
        }
     }

    } catch(err) {

          logger.warn(err.toString());
          return Q.reject(err);
    }

    return nowNext;
  }

  function parseProgramme(prog) {
    var parents = prog.ancestors_titles;
    if(parents){
      var  brand   = parents.brand || parents.series || {},
        episode = parents.episode || {},
        times   = prog.published_time || {},
        image   = prog.image || {},
        res     = {};
    }else{
        var episode = prog.episode,
         brand = {},
         image   = prog.episode.image || {},
         times   = prog.episode,
         res     = {};
    }
    res.episode   = episode.title || episode.containers_title;
    res.brand     = brand.title;
    res.id        = episode.pid;
    res.start     = times.start;
    res.end       = times.end;
    res.duration  = times.duration;

    res.image     = {
      id: image.pid,
      templateUrl: image.template_url
    };


//????
    if(res.episode === res.brand) {
      res.episode = episode.presentation_title;
    }

    return res;
  }

  function setNowNextInterval(service, programme) {
    var nowTime = new Date(),
        endTime, remaining;

    if(programme.hasOwnProperty("end")) {
      endTime = new Date(programme.end);
      remaining = endTime - nowTime;
    } else {
      // programme was not found
      // try again in 1 minute
      remaining =  60 * 1000;
    }

    logger.info("interval", service.id, remaining);
    setTimeout(fetchNowNext, remaining, service);
  }
}
