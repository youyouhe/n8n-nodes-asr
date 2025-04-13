const gulp = require('gulp');
const fs = require('fs');

// Define the directory where icons should be placed after build
const iconsDist = 'dist/nodes/Asr/icons';

// Task to create the icons directory if it doesn't exist
gulp.task('build:icons', (done) => {
  // Ensure the destination directory exists
  if (!fs.existsSync(iconsDist)) {
    fs.mkdirSync(iconsDist, { recursive: true });
    console.log(`Created icons directory: ${iconsDist}`);
  }
  // Copy icon files (.png and .svg)
  return gulp.src(['nodes/Asr/icons/*.png', 'nodes/Asr/icons/*.svg'])
    .pipe(gulp.dest(iconsDist));
});

// Default task (optional)
gulp.task('default', gulp.series('build:icons'));