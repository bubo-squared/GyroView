export default {
  '*.ts': ['eslint --fix --no-warn-ignored', 'prettier --write'],
  '*.{js,cjs,mjs,json,md,yaml,yml,html,css,glsl}': ['prettier --write'],
};
