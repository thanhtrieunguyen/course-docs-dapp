const Auth = artifacts.require("Auth");
const CourseDocument = artifacts.require("CourseDocument");

module.exports = async function(deployer) {
    await deployer.deploy(Auth);
    const authInstance = await Auth.deployed();
    await deployer.deploy(CourseDocument, authInstance.address);
};