const Auth = artifacts.require("Auth");
const CourseDocument = artifacts.require("CourseDocument");

module.exports = async function(deployer, network, accounts) {
  // Xác định địa chỉ Auth contract
  let authAddress;
  
  // Kiểm tra xem Auth đã được triển khai chưa
  const existingAuthAddress = (await Auth.deployed()).address;
  
  if (existingAuthAddress) {
    // Sử dụng địa chỉ Auth đã triển khai
    authAddress = existingAuthAddress;
    console.log("Sử dụng Auth Contract đã triển khai tại:", authAddress);
  } else {
    // Triển khai Auth contract mới
    await deployer.deploy(Auth);
    const authInstance = await Auth.deployed();
    authAddress = authInstance.address;
    console.log("Triển khai Auth Contract mới tại:", authAddress);
  }
  
  // Triển khai CourseDocument contract và truyền địa chỉ Auth
  await deployer.deploy(CourseDocument, authAddress);
  console.log("CourseDocument Contract triển khai tại:", (await CourseDocument.deployed()).address);
};
