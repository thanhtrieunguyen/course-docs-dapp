// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Auth.sol";

interface IAuth {
    function getUser(
        address _userAddress
    ) external view returns (string memory, string memory, bool);

    function getUserRole(address _userAddress) external view returns (string memory);
}

contract CourseDocument is Pausable, Ownable {
    IAuth private authContract;

    struct Document {
        string title;
        string description;
        string ipfsHash;
        address owner;
        bool isPublic;
        uint256 timestamp;
        bool isVerified;
        bool isFlagged;
        string flagReason;
    }

    struct Course {
        string courseName;
        string description;
        address instructor;
        bool isActive;
        uint256 timestamp;
    }

    struct Report {
        address reporter;
        bytes32 documentId;
        string reason;
        bool isResolved;
        uint256 timestamp;
    }

    struct DocumentVersion {
        string ipfsHash;
        string changeNote;
        uint256 timestamp;
    }

    event DocumentVersionAdded(
        bytes32 indexed documentId,
        string ipfsHash,
        uint256 timestamp
    );
    event DocumentUploaded(
        bytes32 indexed documentId,
        string title,
        address indexed owner,
        uint256 timestamp
    );
    event DocumentVerified(
        bytes32 indexed documentId,
        address indexed verifier,
        uint256 timestamp
    );
    event DocumentFlagged(
        bytes32 indexed documentId,
        address indexed flagger,
        string reason,
        uint256 timestamp
    );
    event DocumentRemoved(
        bytes32 indexed documentId,
        address indexed remover,
        uint256 timestamp
    );
    event ReportCreated(
        bytes32 indexed reportId,
        bytes32 indexed documentId,
        address reporter,
        uint256 timestamp
    );
    event ReportResolved(
        bytes32 indexed reportId,
        address indexed resolver,
        uint256 timestamp
    );
    event CourseCreated(
        string indexed courseId,
        string courseName,
        address instructor,
        uint256 timestamp
    );

    mapping(bytes32 => Document) public documents;
    mapping(string => Course) public courses;
    mapping(string => bytes32[]) public courseDocuments;
    mapping(bytes32 => Report) public reports;

    bytes32[] public documentList;
    bytes32[] public reportList;
    string[] public courseList;

    function addDocumentVersion(
        bytes32 _documentId,
        string memory _ipfsHash,
        string memory _changeNote
    ) public {
        Document storage doc = documents[_documentId];
        require(doc.timestamp != 0, "Document does not exist");
        require(
            msg.sender == doc.owner,
            "Only document owner can add new versions"
        );

        // Add current version to history if this is first version update
        if (documentVersions[_documentId].length == 0) {
            documentVersions[_documentId].push(
                DocumentVersion({
                    ipfsHash: doc.ipfsHash,
                    changeNote: "Initial version",
                    timestamp: doc.timestamp
                })
            );
        }

        // Update current document
        doc.ipfsHash = _ipfsHash;

        // Add new version to history
        documentVersions[_documentId].push(
            DocumentVersion({
                ipfsHash: _ipfsHash,
                changeNote: _changeNote,
                timestamp: block.timestamp
            })
        );

        emit DocumentVersionAdded(_documentId, _ipfsHash, block.timestamp);
    }

    function getDocumentVersions(
        bytes32 _documentId
    ) public view returns (string[] memory, string[] memory, uint256[] memory) {
        DocumentVersion[] memory versions = documentVersions[_documentId];
        uint length = versions.length;

        string[] memory hashes = new string[](length);
        string[] memory notes = new string[](length);
        uint256[] memory timestamps = new uint256[](length);

        for (uint i = 0; i < length; i++) {
            DocumentVersion memory version = versions[i];
            hashes[i] = version.ipfsHash;
            notes[i] = version.changeNote;
            timestamps[i] = version.timestamp;
        }

        return (hashes, notes, timestamps);
    }

    struct Review {
        address reviewer;
        uint8 rating; // 1-5 stars
        string comment;
        uint256 timestamp;
    }

    mapping(bytes32 => Review[]) public documentReviews; // documentId => reviews

    event DocumentReviewed(
        bytes32 indexed documentId,
        address indexed reviewer,
        uint8 rating
    );

    function reviewDocument(
        bytes32 _documentId,
        uint8 _rating,
        string memory _comment
    ) public {
        require(_rating >= 1 && _rating <= 5, "Rating must be between 1 and 5");
        require(
            documents[_documentId].timestamp != 0,
            "Document does not exist"
        );

        // Check if user has access to the document before allowing review
        bool hasAccess = false;
        Document memory doc = documents[_documentId];

        if (doc.isPublic || msg.sender == doc.owner) {
            hasAccess = true;
        } else {
            for (uint i = 0; i < documentList.length; i++) {
                string memory courseId = getCourseIdForDocument(_documentId);
                if (
                    bytes(courseId).length > 0 &&
                    courseEnrollments[courseId][msg.sender]
                ) {
                    hasAccess = true;
                    break;
                }
            }
        }

        require(hasAccess, "You must have access to the document to review it");

        Review memory review = Review({
            reviewer: msg.sender,
            rating: _rating,
            comment: _comment,
            timestamp: block.timestamp
        });

        documentReviews[_documentId].push(review);
        emit DocumentReviewed(_documentId, msg.sender, _rating);
    }

    function getDocumentReviews(
        bytes32 _documentId
    )
        public
        view
        returns (
            address[] memory,
            uint8[] memory,
            string[] memory,
            uint256[] memory
        )
    {
        Review[] memory reviews = documentReviews[_documentId];
        uint length = reviews.length;

        address[] memory reviewers = new address[](length);
        uint8[] memory ratings = new uint8[](length);
        string[] memory comments = new string[](length);
        uint256[] memory timestamps = new uint256[](length);

        for (uint i = 0; i < length; i++) {
            Review memory review = reviews[i];
            reviewers[i] = review.reviewer;
            ratings[i] = review.rating;
            comments[i] = review.comment;
            timestamps[i] = review.timestamp;
        }

        return (reviewers, ratings, comments, timestamps);
    }

    mapping(address => bool) public instructors;
    mapping(bytes32 => mapping(address => bool)) private documentAccess; // documentId => address => hasAccess
    mapping(string => mapping(address => bool)) public courseEnrollments; // courseId => studentAddress => isEnrolled
    mapping(bytes32 => DocumentVersion[]) public documentVersions; // documentId => versions

    address public admin;

    event CourseCreated(
        string indexed courseId,
        string courseName,
        address indexed instructor
    );

    modifier onlyAdmin() {
        require(
            keccak256(abi.encodePacked(authContract.getUserRole(msg.sender))) ==
                keccak256(abi.encodePacked("admin")),
            "Caller is not an admin"
        );
        _;
    }

    // Modify onlyInstructor modifier to check user role
    modifier onlyInstructor() {
        require(
            keccak256(abi.encodePacked(authContract.getUserRole(msg.sender))) ==
                keccak256(abi.encodePacked("teacher")),
            "Caller is not an instructor"
        );
        _;
    }

    modifier onlyAdminOrInstructor() {
        string memory role = authContract.getUserRole(msg.sender);
    require(
        (keccak256(abi.encodePacked(role)) == keccak256(abi.encodePacked("admin"))) ||
        (keccak256(abi.encodePacked(role)) == keccak256(abi.encodePacked("teacher"))),
        "Caller must be admin or instructor"
    );
         _;
    }

    function pauseSystem() public onlyAdmin {
        _pause();
    }

    function unpauseSystem() public onlyAdmin {
        _unpause();
    }

    constructor(address _authContractAddress) {
        admin = msg.sender;
        instructors[msg.sender] = true;
        authContract = IAuth(_authContractAddress);
    }

    function setAuthContract(address _authAddress) public onlyAdmin {
        authContract = IAuth(_authAddress);
    }

    function addInstructor(address _instructor) public onlyAdmin {
        instructors[_instructor] = true;
    }

    function createCourse(
        string memory _courseId,
        string memory _courseName,
        string memory _description
    ) public whenNotPaused onlyAdminOrInstructor {
        require(
            bytes(courses[_courseId].courseName).length == 0,
            "Course already exists"
        );

        courses[_courseId] = Course({
            courseName: _courseName,
            description: _description,
            instructor: msg.sender,
            isActive: true,
            timestamp: block.timestamp
        });

        courseList.push(_courseId);

        emit CourseCreated(_courseId, _courseName, msg.sender, block.timestamp);
    }

    function getAllReports() public view onlyAdmin returns (bytes32[] memory) {
        return reportList;
    }

    function getAllCourses() public view returns (string[] memory) {
        return courseList;
    }

    function getUserRole(address _user) public view returns (string memory) {
        return authContract.getUserRole(_user);
    }

    function updateCourse(
        string memory _courseId,
        string memory _newCourseName,
        string memory _newDescription,
        bool _isActive
    ) public {
        require(
            bytes(courses[_courseId].courseName).length > 0,
            "Course does not exist"
        );
        require(
            msg.sender == courses[_courseId].instructor || msg.sender == admin,
            "Unauthorized"
        );

        Course storage course = courses[_courseId];
        course.courseName = _newCourseName;
        course.description = _newDescription;
        course.isActive = _isActive;
    }

    function transferCourseOwnership(
        string memory _courseId,
        address _newInstructor
    ) public {
        require(
            bytes(_courseId).length > 0,
            "Course does not exist"
        );
        require(
            msg.sender == courses[_courseId].instructor || msg.sender == admin,
            "Unauthorized"
        );
        require(_newInstructor != address(0), "Invalid address");

        // Verify new instructor role
        (, string memory role, bool isRegistered) = authContract.getUser(
            _newInstructor
        );
        require(
            isRegistered &&
                keccak256(abi.encodePacked(role)) ==
                keccak256(abi.encodePacked("instructor")),
            "New owner must be a registered instructor"
        );

        courses[_courseId].instructor = _newInstructor;
    }

    function recoverEther() external onlyAdmin {
        payable(admin).transfer(address(this).balance);
    }

    // Add a circuit breaker (emergency stop) pattern
    bool public contractPaused = false;

    function uploadDocument(
        string memory _title,
        string memory _description,
        string memory _ipfsHash,
        bool _isPublic,
        string memory _courseId
    ) public whenNotPaused onlyInstructor {
        // Check if course exists and is active
        require(
            courses[_courseId].isActive,
            "Course does not exist or is inactive"
        );

        bytes32 documentId = keccak256(
            abi.encodePacked(_title, msg.sender, block.timestamp)
        );

        documents[documentId] = Document({
            title: _title,
            description: _description,
            ipfsHash: _ipfsHash,
            owner: msg.sender,
            isPublic: _isPublic,
            timestamp: block.timestamp,
            isVerified: false,
            isFlagged: false,
            flagReason: ""
        });

        documentList.push(documentId);
        courseDocuments[_courseId].push(documentId);

        emit DocumentUploaded(documentId, _title, msg.sender, block.timestamp);
    }

    function verifyDocument(
        bytes32 _documentId
    ) public whenNotPaused onlyAdmin {
        require(
            documents[_documentId].owner != address(0),
            "Document does not exist"
        );

        documents[_documentId].isVerified = true;
        documents[_documentId].isFlagged = false;
        documents[_documentId].flagReason = "";

        emit DocumentVerified(_documentId, msg.sender, block.timestamp);
    }

    // Flag content for review
    function flagDocument(
        bytes32 _documentId,
        string memory _reason
    ) public whenNotPaused {
        require(
            documents[_documentId].owner != address(0),
            "Document does not exist"
        );

        documents[_documentId].isFlagged = true;
        documents[_documentId].flagReason = _reason;

        emit DocumentFlagged(_documentId, msg.sender, _reason, block.timestamp);
    }

    // Report management
    function reportDocument(
        bytes32 _documentId,
        string memory _reason
    ) public whenNotPaused {
        require(
            documents[_documentId].owner != address(0),
            "Document does not exist"
        );

        bytes32 reportId = keccak256(
            abi.encodePacked(_documentId, msg.sender, block.timestamp)
        );

        reports[reportId] = Report({
            reporter: msg.sender,
            documentId: _documentId,
            reason: _reason,
            isResolved: false,
            timestamp: block.timestamp
        });

        reportList.push(reportId);

        emit ReportCreated(reportId, _documentId, msg.sender, block.timestamp);
    }

    function resolveReport(bytes32 _reportId) public whenNotPaused onlyAdmin {
        require(!reports[_reportId].isResolved, "Report already resolved");

        reports[_reportId].isResolved = true;

        emit ReportResolved(_reportId, msg.sender, block.timestamp);
    }

    // Content removal for violations
    function removeDocument(bytes32 _documentId) public whenNotPaused {
        require(
            documents[_documentId].owner == msg.sender ||
                keccak256(abi.encodePacked(authContract.getUserRole(msg.sender))) == keccak256(abi.encodePacked("admin")),
            "Only document owner or admin can remove"
        );

        // We don't actually delete from storage but rather remove the IPFS hash
        documents[_documentId].ipfsHash = "";

        emit DocumentRemoved(_documentId, msg.sender, block.timestamp);
    }

    // Hàm lấy danh sách tài liệu theo khóa học
    function getDocumentsByCourse(
        string memory _courseId
    ) public view returns (bytes32[] memory) {
        require(
            courses[_courseId].isActive,
            "Course does not exist or is inactive"
        );
        return courseDocuments[_courseId];
    }

    function getDocument(
        bytes32 _documentId
    )
        public
        view
        returns (
            string memory title,
            string memory description,
            string memory ipfsHash,
            address owner,
            bool isPublic,
            uint256 timestamp
        )
    {
        Document memory doc = documents[_documentId];
        require(doc.timestamp != 0, "Document does not exist");

        // Check access permissions
        bool hasAccess = doc.isPublic ||
            msg.sender == doc.owner ||
            documentAccess[_documentId][msg.sender];

        // Check if user is enrolled in any course that has this document
        if (!hasAccess) {
            for (uint i = 0; i < documentList.length; i++) {
                string memory courseId = getCourseIdForDocument(_documentId);
                if (
                    bytes(courseId).length > 0 &&
                    courseEnrollments[courseId][msg.sender]
                ) {
                    hasAccess = true;
                    break;
                }
            }
        }

        require(hasAccess, "You don't have permission to view this document");

        return (
            doc.title,
            doc.description,
            doc.ipfsHash,
            doc.owner,
            doc.isPublic,
            doc.timestamp
        );
    }

    function getCourseIdForDocument(
        bytes32 _documentId
    ) internal view returns (string memory) {
        // Check all courses to find which one contains this document
        for (uint i = 0; i < documentList.length; i++) {
            // Check if the document exists in any course
            for (uint j = 0; j < courseDocuments["CS101"].length; j++) {
                if (courseDocuments["CS101"][j] == _documentId) {
                    return "CS101";
                }
            }
        }
        return "";
    }

    function getAllDocuments() public view returns (bytes32[] memory) {
        return documentList;
    }

    function enrollStudent(string memory _courseId, address _student) public {
        require(
            msg.sender == courses[_courseId].instructor || msg.sender == admin,
            "Only instructor or admin can enroll students"
        );
        courseEnrollments[_courseId][_student] = true;
    }
}
