'use strict';

var fs = require('fs-extra');
var request = require('request');
var ProgressBar = require('progress');

module.exports = function(options, next) {
  if (!options.path) {
    return next('No application path provided.');
  }

  // If this is a local file, then it is downloaded.
  if (options.path && fs.existsSync(options.path)) {
    options.directory = options.path;
    return next();
  }

  // If the zipfile is already provided then skip.
  if (options.zipfile) {
    return next();
  }

  // Ensure that this is a GitHub url.
  if (options.path.indexOf('http') === 0 && options.path.indexOf('https://github.com/') !== 0) {
    return next('The project URL must be a GitHub URL');
  }

  // Set the project options.path.
  var projectUrl = (options.path.indexOf('https://github.com/') === 0) ? options.path : 'https://github.com/' + options.path;
  var parts = projectUrl.split('#');
  projectUrl = parts[0];
  var projectName = projectUrl.match(/\/([^/]*\/[^/]*$)/);
  if (projectName.length !== 2) {
    return next('Invalid GitHub project name');
  }

  // Get the repo reference.
  var ref = (parts.length > 1) ? parts[1] : 'master';

  // Set the project name to the matched text.
  projectName = projectName[1];

  console.log('Downloading project...'.green);

  // Download the project.
  var downloadError = null;
  var tries = 0;
  var bar = null;
  (function downloadProject() {
    request.get('https://nodeload.github.com/' + projectName + '/zip/' + ref)
      .on('response', function(res) {
        if (
          !res.headers.hasOwnProperty('content-disposition') ||
          !parseInt(res.headers['content-length'], 10)
        ) {
          if (tries++ > 3) {
            return next('Unable to download project. Please try again.');
          }

          setTimeout(downloadProject, 200);
          return;
        }

        // Setup the progress bar.
        bar = new ProgressBar('  downloading [:bar] :percent :etas', {
          complete: '=',
          incomplete: ' ',
          width: 50,
          total: parseInt(res.headers['content-length'], 10)
        });

        var parts = res.headers['content-disposition'].split(/filename\s*\=\s*/);
        if (parts.length > 1) {
          options.zipfile = parts[1];
          options.directory = options.zipfile.split('.')[0];
        }

        res.pipe(fs.createWriteStream(options.zipfile, {
          flags: 'w'
        }));
        res.on('data', function(chunk) {
          if (bar) {
            bar.tick(chunk.length);
          }
        });
        res.on('error', function(err) {
          downloadError = err;
        });
        res.on('end', function() {
          setTimeout(function() {
            next(downloadError);
          }, 100);
        });
      });
  })();
};
