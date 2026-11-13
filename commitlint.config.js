export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Subjects start with the Jira key (for example "ET-12 record transaction"),
    // which the default subject-case rule misreads as sentence case.
    'subject-case': [0],
  },
};
